-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    subscription_status VARCHAR(50) DEFAULT 'trial',
    subscription_ends_at TIMESTAMPTZ
);

-- Create projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    UNIQUE(company_id, slug)
);

-- Create user_profiles table
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    preferences JSONB DEFAULT '{}'::jsonb
);

-- Create company_members table
CREATE TABLE company_members (
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    permissions JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (company_id, user_id)
);

-- Create project_members table
CREATE TABLE project_members (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES auth.users(id),
    permissions JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (project_id, user_id)
);

-- Create agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'inactive',
    platform VARCHAR(50),
    version VARCHAR(50),
    last_seen TIMESTAMPTZ,
    capabilities JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create agent_heartbeats table
CREATE TABLE agent_heartbeats (
    agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
    last_ping TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50),
    ip_address INET,
    version VARCHAR(50),
    metrics JSONB DEFAULT '{}'::jsonb
);

-- Create transfers table
CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    source_agent_id UUID REFERENCES agents(id),
    destination_agent_id UUID REFERENCES agents(id),
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) DEFAULT 'normal',
    progress DECIMAL(5,2) DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    throughput_mbps DECIMAL(10,2),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT valid_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Add columns that were missing from the generated types
ALTER TABLE user_profiles ADD COLUMN company_id UUID REFERENCES companies(id);
ALTER TABLE transfers ADD COLUMN source_path TEXT;
ALTER TABLE transfers ADD COLUMN destination_path TEXT;
ALTER TABLE transfers ADD COLUMN direction VARCHAR(20) DEFAULT 'upload';
ALTER TABLE transfers ADD COLUMN total_bytes BIGINT;
ALTER TABLE transfers ADD COLUMN transfer_speed BIGINT;

-- Create indexes for performance
CREATE INDEX idx_agents_project_id ON agents(project_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_transfers_project_id ON transfers(project_id);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_transfers_created_at ON transfers(created_at DESC);
CREATE INDEX idx_company_members_user_id ON company_members(user_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_company_id UUID;
    new_project_id UUID;
    company_name TEXT;
    company_slug TEXT;
BEGIN
    -- Create user profile
    INSERT INTO user_profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    
    -- Create company if provided in metadata
    IF NEW.raw_user_meta_data->>'company_name' IS NOT NULL THEN
        company_name := NEW.raw_user_meta_data->>'company_name';
        company_slug := LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'));
        
        -- Ensure unique slug
        WHILE EXISTS (SELECT 1 FROM companies WHERE slug = company_slug) LOOP
            company_slug := company_slug || '-' || substring(md5(random()::text) from 1 for 4);
        END LOOP;
        
        -- Create company
        INSERT INTO companies (name, slug)
        VALUES (company_name, company_slug)
        RETURNING id INTO new_company_id;
        
        -- Add user as owner of the company
        INSERT INTO company_members (company_id, user_id, role)
        VALUES (new_company_id, NEW.id, 'owner');
        
        -- Update user profile with company_id
        UPDATE user_profiles 
        SET company_id = new_company_id 
        WHERE id = NEW.id;
        
        -- Create default project
        INSERT INTO projects (company_id, name, slug)
        VALUES (new_company_id, 'Default Project', 'default')
        RETURNING id INTO new_project_id;
        
        -- Add user to default project
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (new_project_id, NEW.id, 'owner');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for companies
CREATE POLICY "Users can view companies they are members of"
    ON companies FOR SELECT
    USING (id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Company owners can update their companies"
    ON companies FOR UPDATE
    USING (id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = auth.uid() AND role = 'owner'
    ));

-- RLS Policies for projects
CREATE POLICY "Users can view projects they are members of"
    ON projects FOR SELECT
    USING (
        id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
        OR
        company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Project admins can manage projects"
    ON projects FOR ALL
    USING (
        id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- RLS Policies for user_profiles
CREATE POLICY "Users can view all profiles in their company"
    ON user_profiles FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
        OR id = auth.uid()
    );

CREATE POLICY "Users can update their own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

-- RLS Policies for agents
CREATE POLICY "Users can view agents in their projects"
    ON agents FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Project admins can manage agents"
    ON agents FOR ALL
    USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- RLS Policies for transfers
CREATE POLICY "Users can view transfers in their projects"
    ON transfers FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Project members can create transfers"
    ON transfers FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

-- Grant permissions to authenticated users
GRANT ALL ON companies TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON user_profiles TO authenticated;
GRANT ALL ON company_members TO authenticated;
GRANT ALL ON project_members TO authenticated;
GRANT ALL ON agents TO authenticated;
GRANT ALL ON agent_heartbeats TO authenticated;
GRANT ALL ON transfers TO authenticated;

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;