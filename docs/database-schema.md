# Database Schema

## Overview

The TCP Agent Platform uses a multi-tenant PostgreSQL database with Row Level Security (RLS) to ensure data isolation between companies and projects.

## Core Tables

### Companies
```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  subscription_expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  usage_stats JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, slug)
);
```

### Users & Authentication
```sql
-- Extends Supabase auth.users
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company membership
CREATE TABLE company_members (
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'billing_admin', 'admin', 'member')),
  permissions JSONB DEFAULT '{}', -- Override specific permissions
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

-- Project membership
CREATE TABLE project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('project_owner', 'project_admin', 'developer', 'analyst')),
  permissions JSONB DEFAULT '{}',
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
```

### Agents
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  version TEXT,
  platform TEXT,
  capabilities JSONB DEFAULT '{}',
  last_seen TIMESTAMPTZ,
  status TEXT DEFAULT 'offline',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent heartbeats for online/offline status
CREATE TABLE agent_heartbeats (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  last_ping TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'online',
  version TEXT,
  ip_address INET,
  metrics JSONB DEFAULT '{}'
);
```

### Transfers
```sql
CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_agent_id UUID REFERENCES agents(id),
  destination_agent_id UUID REFERENCES agents(id),
  
  -- Transfer details
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  progress FLOAT DEFAULT 0,
  
  -- Performance metrics
  throughput_mbps FLOAT,
  bytes_transferred BIGINT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Transfer chunks for resume capability
CREATE TABLE transfer_chunks (
  id UUID DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES transfers(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_size BIGINT NOT NULL,
  chunk_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (transfer_id, chunk_index)
);
```

### Real-time Telemetry
```sql
-- Time-series telemetry data (partitioned by month)
CREATE TABLE agent_telemetry (
  id UUID DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL, -- Denormalized for performance
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metrics JSONB NOT NULL,
  PRIMARY KEY (agent_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE agent_telemetry_2025_01 PARTITION OF agent_telemetry
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Active transfers for real-time monitoring
CREATE TABLE active_transfers (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL,
  progress FLOAT,
  throughput_mbps FLOAT,
  eta_seconds INT,
  metadata JSONB
);
```

### Scheduling & Automation
```sql
-- Scheduled transfers
CREATE TABLE transfer_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_agent_id UUID REFERENCES agents(id),
  destination_agent_id UUID REFERENCES agents(id),
  
  -- Schedule configuration
  schedule_type TEXT CHECK (schedule_type IN ('cron', 'interval', 'event')),
  cron_expression TEXT,
  interval_seconds INT,
  event_trigger JSONB,
  
  -- Transfer configuration
  source_path TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  transfer_options JSONB DEFAULT '{}',
  
  -- State
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation rules
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Access
```sql
-- API keys for MCP and programmatic access
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  
  -- Key details
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Permissions
  scopes JSONB NOT NULL,
  role TEXT NOT NULL,
  ip_whitelist INET[],
  
  -- Lifecycle
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  -- Usage tracking
  usage_count INT DEFAULT 0,
  rate_limit_per_minute INT DEFAULT 60,
  
  metadata JSONB DEFAULT '{}'
);

-- API usage logs
CREATE TABLE api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INT,
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### External Sharing
```sql
-- External share links
CREATE TABLE external_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  
  -- Link details
  share_token TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  
  -- File details
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  file_hash TEXT,
  
  -- Access controls
  max_downloads INT DEFAULT 1,
  download_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  require_email BOOLEAN DEFAULT false,
  allowed_emails TEXT[],
  
  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  access_logs JSONB DEFAULT '[]',
  
  status TEXT DEFAULT 'pending'
);
```

### Bandwidth & QoS
```sql
-- Bandwidth policies
CREATE TABLE bandwidth_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- Rules
  time_rules JSONB DEFAULT '[]',
  priority_lanes JSONB DEFAULT '{}',
  
  -- Limits
  max_egress_gb_per_day BIGINT,
  preferred_transfer_window TEXT,
  
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Cloud Storage
```sql
-- Cloud storage connections
CREATE TABLE cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT CHECK (provider IN ('s3', 'gcs', 'azure', 'wasabi', 'backblaze')),
  
  -- Encrypted credentials
  credentials_encrypted JSONB NOT NULL,
  
  -- Configuration
  region TEXT,
  endpoint_url TEXT,
  options JSONB DEFAULT '{}',
  
  -- Validation
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Audit & Compliance
```sql
-- Audit log for compliance
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission delegations
CREATE TABLE permission_delegations (
  id UUID PRIMARY KEY,
  from_user_id UUID REFERENCES auth.users(id),
  to_user_id UUID REFERENCES auth.users(id),
  scope TEXT,
  permissions JSONB,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  reason TEXT
);
```

## Row Level Security (RLS) Policies

### Company Isolation
```sql
-- Users can only see companies they're members of
CREATE POLICY "Users see own companies" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
  );

-- Users can only update companies where they're admin/owner
CREATE POLICY "Admins update companies" ON companies
  FOR UPDATE USING (
    id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );
```

### Project Access
```sql
-- Users see projects in their companies or directly assigned
CREATE POLICY "Users see accessible projects" ON projects
  FOR ALL USING (
    company_id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())
    OR id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  );
```

### Transfer Visibility
```sql
-- Users only see transfers in their projects
CREATE POLICY "Users see project transfers" ON transfers
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      LEFT JOIN company_members cm ON cm.company_id = p.company_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      WHERE cm.user_id = auth.uid() OR pm.user_id = auth.uid()
    )
  );
```

## Indexes

```sql
-- Performance indexes
CREATE INDEX idx_transfers_project_status ON transfers(project_id, status);
CREATE INDEX idx_transfers_created ON transfers(created_at DESC);
CREATE INDEX idx_telemetry_time ON agent_telemetry(timestamp DESC);
CREATE INDEX idx_telemetry_agent ON agent_telemetry(agent_id, timestamp DESC);
CREATE INDEX idx_api_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_log_company ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_heartbeat_status ON agent_heartbeats(status, last_ping DESC);
```

## Materialized Views

```sql
-- Real-time dashboard stats
CREATE MATERIALIZED VIEW project_realtime_stats AS
SELECT 
  p.id as project_id,
  COUNT(DISTINCT a.id) as total_agents,
  COUNT(DISTINCT CASE WHEN ah.status = 'online' THEN a.id END) as online_agents,
  COUNT(DISTINCT at.id) as active_transfers,
  COALESCE(SUM(at.throughput_mbps), 0) as total_throughput_mbps,
  COALESCE(SUM(att.metrics->>'bytes_transferred')::BIGINT, 0) as bytes_today
FROM projects p
LEFT JOIN agents a ON a.project_id = p.id
LEFT JOIN agent_heartbeats ah ON ah.agent_id = a.id
LEFT JOIN active_transfers at ON at.project_id = p.id
LEFT JOIN LATERAL (
  SELECT agent_id, metrics
  FROM agent_telemetry
  WHERE agent_id = a.id
    AND timestamp > NOW() - INTERVAL '24 hours'
  ORDER BY timestamp DESC
  LIMIT 1
) att ON true
GROUP BY p.id;

-- Refresh every 10 seconds
CREATE OR REPLACE FUNCTION refresh_realtime_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY project_realtime_stats;
END;
$$ LANGUAGE plpgsql;
```