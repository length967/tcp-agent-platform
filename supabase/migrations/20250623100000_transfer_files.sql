-- Create transfer_files table to track individual files in transfers
CREATE TABLE IF NOT EXISTS transfer_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_id UUID REFERENCES transfers(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash TEXT,
    content_type TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    upload_url TEXT,
    download_url TEXT,
    uploaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_transfer_files_transfer_id ON transfer_files(transfer_id);
CREATE INDEX idx_transfer_files_status ON transfer_files(status);

-- Update transfers table to support multiple files
ALTER TABLE transfers 
    DROP COLUMN IF EXISTS file_name,
    DROP COLUMN IF EXISTS file_size,
    DROP COLUMN IF EXISTS file_hash,
    DROP COLUMN IF EXISTS source_path,
    DROP COLUMN IF EXISTS destination_path,
    ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT 'Untitled Transfer';

-- Create trigger for updated_at
CREATE TRIGGER update_transfer_files_updated_at BEFORE UPDATE ON transfer_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE transfer_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for transfer_files
CREATE POLICY "Users can view their project's transfer files" ON transfer_files
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM transfers t
            JOIN project_members pm ON pm.project_id = t.project_id
            WHERE t.id = transfer_files.transfer_id
            AND pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create transfer files for their projects" ON transfer_files
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM transfers t
            JOIN project_members pm ON pm.project_id = t.project_id
            WHERE t.id = transfer_files.transfer_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('admin', 'owner', 'editor')
        )
    );

CREATE POLICY "Users can update their project's transfer files" ON transfer_files
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM transfers t
            JOIN project_members pm ON pm.project_id = t.project_id
            WHERE t.id = transfer_files.transfer_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('admin', 'owner', 'editor')
        )
    );

CREATE POLICY "Service role has full access to transfer files" ON transfer_files
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);