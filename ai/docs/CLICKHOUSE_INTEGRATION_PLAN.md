# ClickHouse Integration Plan for AI Transfer Optimization

**Date**: January 25, 2025  
**Decision**: Switch from Supabase to ClickHouse for high-volume telemetry data storage

## 🎯 Why ClickHouse?

### **Cost & Performance Benefits**
- **100x faster** than traditional databases for analytical queries
- **Best-in-class compression** ratios that dramatically reduce storage costs
- **Column-oriented storage** - perfect for time-series telemetry data
- **Resource efficient** - much cheaper than Supabase for large datasets

### **Perfect for AI Pipeline**
- **Real-time analytics** capabilities for live transfer optimization
- **Native time-series functions** for trend analysis and forecasting
- **Parallel processing** for fast ML feature extraction
- **Built-in aggregation functions** for real-time dashboards

## 🏗️ Architecture Design

### **Dual Storage Strategy**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TCP Agents    │───▶│   ClickHouse    │───▶│   ML Models     │
│                 │    │  (Telemetry)    │    │  (Training)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │    Supabase     │
                       │ (User/Projects) │
                       └─────────────────┘
```

### **Data Separation**
- **ClickHouse**: High-volume telemetry, metrics, ML training data
- **Supabase**: User authentication, project management, configuration

## 📊 ClickHouse Schema Design

### **Telemetry Table**
```sql
CREATE TABLE tcp_telemetry (
    timestamp DateTime64(3),
    agent_id String,
    transfer_id String,
    project_id String,
    
    -- Network Metrics
    bandwidth_mbps Float64,
    latency_ms Float64,
    packet_loss_rate Float64,
    jitter_ms Float64,
    rtt_ms Float64,
    
    -- Transfer Metrics
    throughput_mbps Float64,
    bytes_transferred UInt64,
    transfer_duration_ms UInt64,
    chunk_size UInt32,
    concurrent_connections UInt16,
    
    -- System Metrics
    cpu_usage Float64,
    memory_usage Float64,
    disk_io_mbps Float64,
    network_utilization Float64,
    
    -- Environmental
    hour_of_day UInt8,
    day_of_week UInt8,
    is_weekend UInt8,
    
    -- Optimization Results
    predicted_throughput Float64,
    actual_throughput Float64,
    optimization_applied String,
    improvement_percent Float64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (agent_id, timestamp)
TTL timestamp + INTERVAL 1 YEAR;
```

### **Model Performance Tracking**
```sql
CREATE TABLE ml_model_performance (
    timestamp DateTime64(3),
    model_name String,
    model_version String,
    prediction_accuracy Float64,
    mae Float64,
    rmse Float64,
    r2_score Float64,
    training_samples UInt64,
    inference_time_ms Float64
)
ENGINE = MergeTree()
ORDER BY (model_name, timestamp)
TTL timestamp + INTERVAL 6 MONTH;
```

## 🔧 Implementation Steps

### **Phase 1: ClickHouse Setup**
1. **Installation Options**:
   - Local: `docker run -d --name clickhouse-server clickhouse/clickhouse-server`
   - Cloud: ClickHouse Cloud, AWS, or self-hosted
   
2. **Configuration**:
   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     clickhouse:
       image: clickhouse/clickhouse-server:latest
       ports:
         - "8123:8123"  # HTTP interface
         - "9000:9000"  # Native interface
       volumes:
         - ./clickhouse-data:/var/lib/clickhouse
         - ./clickhouse-config:/etc/clickhouse-server
   ```

### **Phase 2: Data Pipeline**
1. **TCP Agent Integration**:
   - Modify Go agents to send telemetry to ClickHouse
   - Use HTTP interface for simplicity
   - Batch inserts for performance

2. **Python Client Setup**:
   ```python
   # Add to requirements.txt
   clickhouse-connect>=0.6.0
   
   # Connection example
   import clickhouse_connect
   
   client = clickhouse_connect.get_client(
       host='localhost',
       port=8123,
       username='default',
       password=''
   )
   ```

### **Phase 3: ML Integration**
1. **Feature Engineering from ClickHouse**:
   ```python
   def extract_features_from_clickhouse(agent_id: str, hours: int = 24):
       query = f"""
       SELECT 
           avg(bandwidth_mbps) as avg_bandwidth,
           avg(latency_ms) as avg_latency,
           avg(packet_loss_rate) as avg_packet_loss,
           max(throughput_mbps) as max_throughput,
           count() as transfer_count
       FROM tcp_telemetry 
       WHERE agent_id = '{agent_id}' 
         AND timestamp >= now() - INTERVAL {hours} HOUR
       """
       return client.query(query).result_rows[0]
   ```

2. **Real-time Analytics**:
   ```sql
   -- Live transfer performance dashboard
   SELECT 
       toStartOfMinute(timestamp) as minute,
       avg(throughput_mbps) as avg_throughput,
       count() as transfer_count,
       avg(optimization_applied != '') as optimization_rate
   FROM tcp_telemetry 
   WHERE timestamp >= now() - INTERVAL 1 HOUR
   GROUP BY minute
   ORDER BY minute DESC;
   ```

## 📈 Performance Optimizations

### **ClickHouse Specific**
- **Partitioning**: By month for efficient data lifecycle management
- **Ordering**: By agent_id and timestamp for optimal query performance  
- **TTL**: Automatic data cleanup after 1 year
- **Compression**: LZ4 compression for storage efficiency

### **Query Optimization**
- **Materialized Views** for pre-computed aggregations
- **Projection** for alternative data layouts
- **Sampling** for fast approximate queries on large datasets

## 💰 Cost Analysis

### **Estimated Savings vs Supabase**
- **Storage**: 80-90% reduction due to compression
- **Compute**: 70-80% reduction for analytical queries
- **Bandwidth**: Reduced due to efficient compression
- **Total**: 75-85% cost reduction for telemetry workload

### **Example Monthly Costs**
```
Telemetry Data: 1TB/month, 1M queries/month

Supabase Estimate:
- Storage: $250/month
- Compute: $200/month  
- Total: ~$450/month

ClickHouse Estimate:
- Storage: $50/month (compressed)
- Compute: $60/month
- Total: ~$110/month

Savings: ~$340/month (76% reduction)
```

## 🔄 Migration Strategy

### **Gradual Migration**
1. **Week 1**: Set up ClickHouse alongside Supabase
2. **Week 2**: Start dual-writing telemetry data
3. **Week 3**: Migrate ML training to use ClickHouse data
4. **Week 4**: Switch all analytics to ClickHouse
5. **Week 5**: Remove telemetry from Supabase

### **Rollback Plan**
- Keep Supabase telemetry tables for 30 days
- Maintain dual-write capability
- Quick switch back if issues arise

## 🛠️ Tools & Libraries

### **Python Integration**
```python
# requirements.txt additions
clickhouse-connect>=0.6.0
clickhouse-driver>=0.2.6
pandas>=1.5.0
```

### **Go Integration**
```go
// For TCP agents
import "github.com/ClickHouse/clickhouse-go/v2"
```

### **Monitoring**
- **ClickHouse System Tables** for performance monitoring
- **Grafana Dashboards** for visualization
- **Custom alerts** for data quality issues

## 📋 Next Session Checklist

When resuming AI work:

1. **Setup ClickHouse**:
   - [ ] Install ClickHouse (local or cloud)
   - [ ] Create telemetry schema
   - [ ] Test basic insert/query operations

2. **Data Pipeline**:
   - [ ] Modify TCP agents for ClickHouse integration
   - [ ] Create Python data collection scripts
   - [ ] Set up batch processing for ML training

3. **ML Integration**:
   - [ ] Update feature engineering to use ClickHouse
   - [ ] Train XGBoost models on real data
   - [ ] Implement real-time prediction pipeline

4. **Validation**:
   - [ ] Compare prediction accuracy with real transfers
   - [ ] Measure optimization impact on throughput
   - [ ] Monitor system performance and costs

---

**Status**: Ready for ClickHouse integration  
**Priority**: Cost optimization and real-time analytics capability  
**Expected Impact**: 75% cost reduction + 100x faster analytics 