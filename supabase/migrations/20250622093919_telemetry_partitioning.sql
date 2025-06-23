-- Create agent_telemetry table with time-series partitioning
-- This table stores high-frequency telemetry data from agents

-- Create the parent table for partitioning
CREATE TABLE agent_telemetry (
    id UUID DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    project_id UUID NOT NULL, -- Denormalized for performance
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    metrics JSONB NOT NULL,
    PRIMARY KEY (agent_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create indexes for efficient queries
CREATE INDEX idx_telemetry_project_time ON agent_telemetry (project_id, timestamp DESC);
CREATE INDEX idx_telemetry_agent_time ON agent_telemetry (agent_id, timestamp DESC);

-- Create function to automatically create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    -- Get the start of current month
    start_date := date_trunc('month', CURRENT_DATE);
    end_date := start_date + interval '1 month';
    partition_name := 'agent_telemetry_' || to_char(start_date, 'YYYY_MM');
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        -- Create the partition
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_telemetry
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        
        -- Enable RLS on the partition
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
        
        -- Grant permissions
        EXECUTE format('GRANT ALL ON %I TO authenticated', partition_name);
        EXECUTE format('GRANT ALL ON %I TO service_role', partition_name);
    END IF;
    
    -- Also create next month's partition to avoid issues at month boundary
    start_date := end_date;
    end_date := start_date + interval '1 month';
    partition_name := 'agent_telemetry_' || to_char(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF agent_telemetry
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
        EXECUTE format('GRANT ALL ON %I TO authenticated', partition_name);
        EXECUTE format('GRANT ALL ON %I TO service_role', partition_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create initial partitions for current and next month
SELECT create_monthly_partition();

-- Create a scheduled job to create new partitions (requires pg_cron extension)
-- This would run on the 25th of each month to ensure next month's partition exists
-- Note: pg_cron setup would be done separately in production

-- Create table for active transfers (not partitioned, as it's a small working set)
CREATE TABLE active_transfers (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) NOT NULL,
    progress DECIMAL(5,2),
    throughput_mbps DECIMAL(10,2),
    eta_seconds INT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for active transfers
CREATE INDEX idx_active_transfers_project ON active_transfers(project_id);
CREATE INDEX idx_active_transfers_agent ON active_transfers(agent_id);
CREATE INDEX idx_active_transfers_updated ON active_transfers(updated_at DESC);

-- Create materialized view for real-time dashboard stats
CREATE MATERIALIZED VIEW project_realtime_stats AS
SELECT 
    p.id as project_id,
    COUNT(DISTINCT a.id) as total_agents,
    COUNT(DISTINCT CASE WHEN ah.status = 'online' THEN a.id END) as online_agents,
    COUNT(DISTINCT at.id) as active_transfers,
    COALESCE(SUM(at.throughput_mbps), 0) as total_throughput_mbps,
    COALESCE(SUM(
        CASE 
            WHEN att.timestamp > NOW() - INTERVAL '24 hours' 
            THEN (att.metrics->>'bytes_transferred')::BIGINT 
            ELSE 0 
        END
    ), 0) as bytes_today
FROM projects p
LEFT JOIN agents a ON a.project_id = p.id
LEFT JOIN agent_heartbeats ah ON ah.agent_id = a.id
LEFT JOIN active_transfers at ON at.project_id = p.id
LEFT JOIN LATERAL (
    SELECT agent_id, metrics, timestamp
    FROM agent_telemetry
    WHERE agent_id = a.id
      AND timestamp > NOW() - INTERVAL '24 hours'
    ORDER BY timestamp DESC
    LIMIT 1
) att ON true
GROUP BY p.id;

-- Create index for concurrent refresh
CREATE UNIQUE INDEX idx_project_realtime_stats_project ON project_realtime_stats(project_id);

-- Function to refresh stats (would be called periodically)
CREATE OR REPLACE FUNCTION refresh_realtime_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY project_realtime_stats;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on new tables
ALTER TABLE agent_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agent_telemetry
CREATE POLICY "Users can view telemetry for their project agents"
    ON agent_telemetry FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert telemetry"
    ON agent_telemetry FOR INSERT
    TO service_role
    WITH CHECK (true);

-- RLS Policies for active_transfers
CREATE POLICY "Users can view active transfers in their projects"
    ON active_transfers FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage active transfers"
    ON active_transfers FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON agent_telemetry TO authenticated;
GRANT ALL ON agent_telemetry TO service_role;
GRANT SELECT ON active_transfers TO authenticated;
GRANT ALL ON active_transfers TO service_role;
GRANT SELECT ON project_realtime_stats TO authenticated;

-- Create function to clean up old telemetry data based on retention policy
CREATE OR REPLACE FUNCTION cleanup_old_telemetry()
RETURNS void AS $$
DECLARE
    retention_days int;
    cutoff_date date;
    partition_name text;
BEGIN
    -- Get retention days based on subscription tier (default 7 days)
    -- This would be enhanced to check actual subscription tier
    retention_days := 7;
    cutoff_date := CURRENT_DATE - retention_days;
    
    -- Drop partitions older than retention period
    FOR partition_name IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'agent_telemetry_%'
        AND tablename < 'agent_telemetry_' || to_char(cutoff_date, 'YYYY_MM')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Add telemetry-related columns to companies table for tier-based settings
ALTER TABLE companies ADD COLUMN IF NOT EXISTS telemetry_retention_days INT DEFAULT 7;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS telemetry_update_interval_ms INT DEFAULT 30000; -- 30s default

-- Update subscription tier constraints
ALTER TABLE companies DROP CONSTRAINT IF EXISTS valid_subscription_status;
ALTER TABLE companies ADD CONSTRAINT valid_subscription_status 
    CHECK (subscription_status IN ('trial', 'free', 'starter', 'professional', 'enterprise'));

-- Function to get telemetry settings based on subscription
CREATE OR REPLACE FUNCTION get_telemetry_settings(company_id UUID)
RETURNS TABLE (
    retention_days INT,
    update_interval_ms INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE subscription_status
            WHEN 'free' THEN 7
            WHEN 'starter' THEN 30
            WHEN 'professional' THEN 90
            WHEN 'enterprise' THEN 365
            ELSE 7
        END as retention_days,
        CASE subscription_status
            WHEN 'free' THEN 30000      -- 30 seconds
            WHEN 'starter' THEN 5000     -- 5 seconds
            WHEN 'professional' THEN 1000 -- 1 second
            WHEN 'enterprise' THEN 100   -- 100ms
            ELSE 30000
        END as update_interval_ms
    FROM companies
    WHERE id = company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;