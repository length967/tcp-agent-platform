-- Enhanced telemetry schema for ML features
CREATE TABLE ml_telemetry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    transfer_id UUID REFERENCES transfers(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Network metrics
    bandwidth_utilization DECIMAL(5,2), -- 0-100%
    latency_ms INTEGER,
    packet_loss_rate DECIMAL(5,4), -- 0-1
    connection_count INTEGER,
    tcp_window_size INTEGER,
    
    -- System metrics
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_io_wait DECIMAL(5,2),
    load_average DECIMAL(5,2),
    
    -- Transfer metrics
    throughput_mbps DECIMAL(10,2),
    chunk_size INTEGER,
    concurrent_streams INTEGER,
    retry_count INTEGER,
    compression_ratio DECIMAL(5,2),
    
    -- Environmental factors
    time_of_day INTEGER, -- 0-23
    day_of_week INTEGER, -- 1-7
    is_business_hours BOOLEAN,
    geographic_region TEXT,
    network_type TEXT, -- wifi, ethernet, cellular
    
    -- Quality metrics
    success_rate DECIMAL(5,2),
    error_rate DECIMAL(5,2),
    user_satisfaction_score INTEGER -- 1-5
);

-- Feature aggregation tables
CREATE TABLE hourly_performance_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES agents(id),
    hour_bucket TIMESTAMPTZ,
    avg_throughput DECIMAL(10,2),
    p95_latency INTEGER,
    success_rate DECIMAL(5,2),
    total_transfers INTEGER,
    total_data_gb DECIMAL(10,2)
);

-- Model performance tracking
CREATE TABLE ml_model_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    prediction_id UUID,
    predicted_value JSONB,
    actual_value JSONB,
    prediction_error DECIMAL(10,4),
    confidence_score DECIMAL(5,4),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Model drift detection
CREATE TABLE ml_model_drift (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    drift_metric VARCHAR(50), -- 'psi', 'ks_test', 'chi_square'
    drift_score DECIMAL(10,6),
    threshold_exceeded BOOLEAN,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    feature_drifts JSONB -- Per-feature drift scores
);

-- Create indexes for performance
CREATE INDEX idx_ml_telemetry_agent_time ON ml_telemetry (agent_id, timestamp DESC);
CREATE INDEX idx_ml_telemetry_transfer_time ON ml_telemetry (transfer_id, timestamp DESC);
CREATE INDEX idx_ml_telemetry_timestamp ON ml_telemetry (timestamp DESC);
CREATE INDEX idx_hourly_metrics_agent_hour ON hourly_performance_metrics (agent_id, hour_bucket DESC);
CREATE INDEX idx_model_performance_name_time ON ml_model_performance (model_name, timestamp DESC);
CREATE INDEX idx_model_drift_name_time ON ml_model_drift (model_name, detected_at DESC);

-- Enable RLS
ALTER TABLE ml_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_model_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_model_drift ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ml_telemetry
CREATE POLICY "Users can view ML telemetry for their project agents"
    ON ml_telemetry FOR SELECT
    USING (
        agent_id IN (
            SELECT a.id FROM agents a
            JOIN project_members pm ON pm.project_id = a.project_id
            WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can insert ML telemetry"
    ON ml_telemetry FOR INSERT
    TO service_role
    WITH CHECK (true);

-- RLS Policies for hourly_performance_metrics
CREATE POLICY "Users can view performance metrics for their project agents"
    ON hourly_performance_metrics FOR SELECT
    USING (
        agent_id IN (
            SELECT a.id FROM agents a
            JOIN project_members pm ON pm.project_id = a.project_id
            WHERE pm.user_id = auth.uid()
        )
    );

-- RLS Policies for model performance tracking
CREATE POLICY "Service role can manage model performance"
    ON ml_model_performance FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage model drift"
    ON ml_model_drift FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON ml_telemetry TO authenticated;
GRANT ALL ON ml_telemetry TO service_role;
GRANT SELECT ON hourly_performance_metrics TO authenticated;
GRANT ALL ON hourly_performance_metrics TO service_role;
GRANT SELECT ON ml_model_performance TO authenticated;
GRANT ALL ON ml_model_performance TO service_role;
GRANT SELECT ON ml_model_drift TO authenticated;
GRANT ALL ON ml_model_drift TO service_role; 