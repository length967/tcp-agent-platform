-- Add missing RLS policies for tables that have RLS enabled but no policies

-- RLS Policies for agent_heartbeats
-- This table stores agent heartbeat/status information
CREATE POLICY "Users can view agent heartbeats in their projects"
    ON agent_heartbeats FOR SELECT
    USING (
        agent_id IN (
            SELECT a.id 
            FROM agents a
            JOIN project_members pm ON a.project_id = pm.project_id
            WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Agents can update their own heartbeat"
    ON agent_heartbeats FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Agents can insert their own heartbeat"
    ON agent_heartbeats FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Service role can delete heartbeats"
    ON agent_heartbeats FOR DELETE
    TO service_role
    USING (true);

-- RLS Policies for agent_telemetry partition tables
-- The parent table has policies, but partitions need their own
-- This function will add policies to all existing and future partitions
CREATE OR REPLACE FUNCTION add_telemetry_partition_policies(partition_name text)
RETURNS void AS $$
BEGIN
    -- Users can view telemetry for their project agents
    EXECUTE format(
        'CREATE POLICY "Users can view telemetry for their project agents"
        ON %I FOR SELECT
        USING (
            project_id IN (
                SELECT project_id FROM project_members WHERE user_id = auth.uid()
            )
        )',
        partition_name
    );
    
    -- Service role can insert telemetry
    EXECUTE format(
        'CREATE POLICY "Service role can insert telemetry"
        ON %I FOR INSERT
        TO service_role
        WITH CHECK (true)',
        partition_name
    );
    
    -- Service role can delete old telemetry
    EXECUTE format(
        'CREATE POLICY "Service role can delete telemetry"
        ON %I FOR DELETE
        TO service_role
        USING (true)',
        partition_name
    );
END;
$$ LANGUAGE plpgsql;

-- Apply policies to existing partitions
DO $$
DECLARE
    partition_record RECORD;
BEGIN
    FOR partition_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'agent_telemetry_%'
        AND schemaname = 'public'
    LOOP
        -- Check if policies already exist
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE tablename = partition_record.tablename
            AND schemaname = 'public'
        ) THEN
            PERFORM add_telemetry_partition_policies(partition_record.tablename);
        END IF;
    END LOOP;
END;
$$;

-- Update the create_monthly_partition function to automatically add policies
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
        
        -- Add policies to the partition
        PERFORM add_telemetry_partition_policies(partition_name);
        
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
        
        -- Add policies to the partition
        PERFORM add_telemetry_partition_policies(partition_name);
        
        EXECUTE format('GRANT ALL ON %I TO authenticated', partition_name);
        EXECUTE format('GRANT ALL ON %I TO service_role', partition_name);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update search_path for the new function
ALTER FUNCTION add_telemetry_partition_policies SET search_path = '';
ALTER FUNCTION create_monthly_partition SET search_path = '';