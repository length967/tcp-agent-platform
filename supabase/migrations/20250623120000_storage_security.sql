-- Create function to calculate project storage usage
CREATE OR REPLACE FUNCTION get_project_storage_usage(p_project_id UUID)
RETURNS BIGINT AS $$
DECLARE
    total_usage BIGINT;
BEGIN
    -- Calculate total storage used by all transfer files in the project
    SELECT COALESCE(SUM(tf.file_size), 0)
    INTO total_usage
    FROM transfer_files tf
    JOIN transfers t ON tf.transfer_id = t.id
    WHERE t.project_id = p_project_id
    AND tf.status IN ('uploaded', 'completed');
    
    RETURN total_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create table to track file downloads for audit purposes
CREATE TABLE IF NOT EXISTS transfer_file_downloads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_file_id UUID REFERENCES transfer_files(id) ON DELETE CASCADE,
    downloaded_by UUID NOT NULL,
    downloaded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_transfer_file_downloads_file ON transfer_file_downloads(transfer_file_id);
CREATE INDEX idx_transfer_file_downloads_user ON transfer_file_downloads(downloaded_by);

-- Update transfer_files table to track upload status
ALTER TABLE transfer_files 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'uploaded', 'failed', 'deleted')),
ADD COLUMN IF NOT EXISTS upload_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS upload_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create storage buckets for transfers (if using Supabase Storage)
-- This would be done through Supabase dashboard or API
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--     'transfer-files', 
--     'transfer-files', 
--     false, 
--     5368709120, -- 5GB
--     ARRAY['image/*', 'video/*', 'audio/*', 'application/*', 'text/*']
-- ) ON CONFLICT (id) DO NOTHING;

-- RLS policies for transfer file downloads
ALTER TABLE transfer_file_downloads ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can insert download records
CREATE POLICY "Users can track their downloads" ON transfer_file_downloads
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = downloaded_by);

-- Users can view download history for their transfers
CREATE POLICY "Users can view download history" ON transfer_file_downloads
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM transfer_files tf
            JOIN transfers t ON tf.transfer_id = t.id
            JOIN project_members pm ON t.project_id = pm.project_id
            WHERE tf.id = transfer_file_downloads.transfer_file_id
            AND pm.user_id = auth.uid()
        )
    );

-- Function to validate file upload permissions
CREATE OR REPLACE FUNCTION validate_file_upload(
    p_transfer_id UUID,
    p_agent_id UUID,
    p_file_size BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
    v_transfer RECORD;
    v_project_usage BIGINT;
    v_project_limit BIGINT;
BEGIN
    -- Get transfer details
    SELECT t.*, p.settings
    INTO v_transfer
    FROM transfers t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = p_transfer_id;
    
    -- Check if transfer exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;
    
    -- Check if agent is the source agent
    IF v_transfer.source_agent_id != p_agent_id THEN
        RAISE EXCEPTION 'Only source agent can upload files';
    END IF;
    
    -- Check transfer status
    IF v_transfer.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Transfer is not active';
    END IF;
    
    -- Check storage quota
    v_project_usage := get_project_storage_usage(v_transfer.project_id);
    v_project_limit := COALESCE((v_transfer.settings->>'storage_limit')::BIGINT, 10737418240); -- 10GB default
    
    IF v_project_usage + p_file_size > v_project_limit THEN
        RAISE EXCEPTION 'Storage quota exceeded';
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired upload URLs
CREATE OR REPLACE FUNCTION cleanup_expired_uploads()
RETURNS void AS $$
BEGIN
    -- Mark files as failed if upload didn't complete within 24 hours
    UPDATE transfer_files
    SET 
        status = 'failed',
        error_message = 'Upload timeout'
    WHERE 
        status = 'uploading'
        AND upload_started_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled job to clean up expired uploads (requires pg_cron)
-- SELECT cron.schedule('cleanup-expired-uploads', '0 * * * *', 'SELECT cleanup_expired_uploads();');