-- Create agent registration tokens table
CREATE TABLE IF NOT EXISTS agent_registration_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for token lookups
CREATE INDEX idx_agent_registration_tokens_token ON agent_registration_tokens(token);
CREATE INDEX idx_agent_registration_tokens_expires ON agent_registration_tokens(expires_at);

-- Add api_key_hash column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

-- Create index for API key lookups
CREATE INDEX idx_agents_api_key_hash ON agents(api_key_hash);

-- RLS policies for agent registration tokens
ALTER TABLE agent_registration_tokens ENABLE ROW LEVEL SECURITY;

-- Only users in the same company can create/view tokens
CREATE POLICY "Users can create registration tokens for their projects" ON agent_registration_tokens
    FOR INSERT TO authenticated
    WITH CHECK (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view tokens for their projects" ON agent_registration_tokens
    FOR SELECT TO authenticated
    USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = auth.uid()
        )
    );

-- Service role can do everything
CREATE POLICY "Service role has full access to tokens" ON agent_registration_tokens
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM agent_registration_tokens
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;