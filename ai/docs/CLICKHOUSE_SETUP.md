# ClickHouse Setup Instructions

Complete guide for setting up ClickHouse locally for AI transfer optimization development.

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

1. **Start ClickHouse**:
   ```bash
   cd tcp-agent-platform
   docker-compose -f docker-compose.clickhouse.yml up -d clickhouse
   ```

2. **Verify Connection**:
   ```bash
   curl "http://localhost:8123/ping"
   # Should return "Ok."
   ```

3. **Test with Sample Query**:
   ```bash
   curl "http://localhost:8123/?query=SELECT%20version()"
   ```

### Option 2: Direct Docker Run

```bash
# Start ClickHouse server
docker run -d \
  --name tcp-clickhouse \
  -p 8123:8123 \
  -p 9000:9000 \
  -v clickhouse_data:/var/lib/clickhouse \
  clickhouse/clickhouse-server:23.8

# Test connection
curl "http://localhost:8123/ping"
```

### Option 3: Native Installation (macOS)

```bash
# Install via Homebrew
brew install clickhouse

# Start server
clickhouse-server

# In another terminal, connect client
clickhouse-client
```

## 🔧 Configuration

### Environment Variables

Create `.env.local` file:
```bash
# ClickHouse Configuration
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=tcp_optimization

# For production, use secure credentials:
# CLICKHOUSE_USER=tcp_user
# CLICKHOUSE_PASSWORD=your_secure_password
```

### Custom Configuration (Optional)

Create `clickhouse-config/` directory with custom settings:

```bash
mkdir -p clickhouse-config
```

**`clickhouse-config/memory.xml`**:
```xml
<clickhouse>
    <max_memory_usage>4000000000</max_memory_usage>
    <max_bytes_before_external_group_by>2000000000</max_bytes_before_external_group_by>
    <max_bytes_before_external_sort>2000000000</max_bytes_before_external_sort>
</clickhouse>
```

**`clickhouse-config/logging.xml`**:
```xml
<clickhouse>
    <logger>
        <level>information</level>
        <log>/var/log/clickhouse-server/clickhouse-server.log</log>
        <errorlog>/var/log/clickhouse-server/clickhouse-server.err.log</errorlog>
        <size>1000M</size>
        <count>10</count>
    </logger>
</clickhouse>
```

## 🏗️ Database Setup

### 1. Initialize Schema

**Using Python**:
```bash
cd tcp-agent-platform/ai
python -c "
import asyncio
from clickhouse_client import create_clickhouse_client

async def setup():
    client = await create_clickhouse_client()
    print('✅ ClickHouse schema initialized!')
    client.close()

asyncio.run(setup())
"
```

**Using SQL directly**:
```bash
# Connect to ClickHouse
docker exec -it tcp-clickhouse clickhouse-client

# Or via HTTP
curl -X POST "http://localhost:8123/" \
  -H "Content-Type: text/plain" \
  --data-binary "CREATE DATABASE IF NOT EXISTS tcp_optimization"
```

### 2. Verify Tables

```sql
-- List databases
SHOW DATABASES;

-- Use the database
USE tcp_optimization;

-- List tables
SHOW TABLES;

-- Check table structure
DESCRIBE tcp_telemetry;
```

## 🧪 Testing the Setup

### 1. Insert Sample Data

**Using Python**:
```python
# Run the example in clickhouse_client.py
cd tcp-agent-platform/ai
python clickhouse_client.py
```

**Using SQL**:
```sql
INSERT INTO tcp_telemetry VALUES
(
    now(),
    'test-agent-001',
    'test-transfer-001', 
    'test-project-001',
    100.0,  -- bandwidth_mbps
    50.0,   -- latency_ms
    0.01,   -- packet_loss_rate
    5.0,    -- jitter_ms
    100.0,  -- rtt_ms
    85.0,   -- throughput_mbps
    104857600, -- bytes_transferred (100MB)
    12000,  -- transfer_duration_ms
    65536,  -- chunk_size
    4,      -- concurrent_connections
    45.0,   -- cpu_usage
    60.0,   -- memory_usage
    200.0,  -- disk_io_mbps
    75.0,   -- network_utilization
    14,     -- hour_of_day
    2,      -- day_of_week
    0,      -- is_weekend
    80.0,   -- predicted_throughput
    85.0,   -- actual_throughput
    'chunk_size_optimized', -- optimization_applied
    6.25    -- improvement_percent
);
```

### 2. Query Sample Data

```sql
-- Count records
SELECT count() FROM tcp_telemetry;

-- Get recent transfers
SELECT 
    agent_id,
    throughput_mbps,
    latency_ms,
    optimization_applied
FROM tcp_telemetry 
ORDER BY timestamp DESC 
LIMIT 10;

-- Performance analytics
SELECT 
    toStartOfHour(timestamp) as hour,
    avg(throughput_mbps) as avg_throughput,
    count() as transfer_count
FROM tcp_telemetry 
GROUP BY hour 
ORDER BY hour DESC;
```

## 📊 Optional: Grafana Dashboard

### 1. Start Grafana

```bash
docker-compose -f docker-compose.clickhouse.yml --profile monitoring up -d grafana
```

### 2. Access Grafana

- URL: http://localhost:3000
- Username: `admin`
- Password: `admin`

### 3. Add ClickHouse Data Source

1. Go to Configuration → Data Sources
2. Add ClickHouse data source
3. Configure:
   - **URL**: `http://clickhouse:8123`
   - **Database**: `tcp_optimization`
   - **Username**: `default` (or your configured user)

### 4. Create Dashboard

Import the sample dashboard configuration:

```json
{
  "dashboard": {
    "title": "TCP Transfer Optimization",
    "panels": [
      {
        "title": "Transfer Throughput Over Time",
        "type": "graph",
        "targets": [
          {
            "query": "SELECT timestamp, avg(throughput_mbps) FROM tcp_telemetry WHERE $__timeFilter(timestamp) GROUP BY timestamp ORDER BY timestamp"
          }
        ]
      }
    ]
  }
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Connection Refused**:
   ```bash
   # Check if ClickHouse is running
   docker ps | grep clickhouse
   
   # Check logs
   docker logs tcp-clickhouse
   ```

2. **Permission Denied**:
   ```bash
   # Fix volume permissions
   sudo chown -R 101:101 clickhouse_data/
   ```

3. **Memory Issues**:
   ```bash
   # Check available memory
   docker stats tcp-clickhouse
   
   # Reduce memory limits in config
   ```

### Performance Tuning

1. **For Development**:
   ```xml
   <!-- clickhouse-config/development.xml -->
   <clickhouse>
       <max_memory_usage>1000000000</max_memory_usage>
       <max_threads>4</max_threads>
   </clickhouse>
   ```

2. **For Production**:
   ```xml
   <!-- clickhouse-config/production.xml -->
   <clickhouse>
       <max_memory_usage>8000000000</max_memory_usage>
       <max_threads>16</max_threads>
       <background_pool_size>32</background_pool_size>
   </clickhouse>
   ```

## 🚀 Next Steps

Once ClickHouse is running:

1. **Test the Python Client**:
   ```bash
   cd tcp-agent-platform/ai
   pip install -r requirements.txt
   python clickhouse_client.py
   ```

2. **Integrate with ML Models**:
   ```python
   from clickhouse_client import create_clickhouse_client
   from models.performance_predictor import TransferPerformancePredictor
   
   # Train model with real data
   client = await create_clickhouse_client()
   training_data = await client.get_training_data()
   
   predictor = TransferPerformancePredictor()
   predictor.train(training_data)
   ```

3. **Start Collecting Real Telemetry**:
   - Modify TCP agents to send data to ClickHouse
   - Set up batch processing for ML training
   - Implement real-time prediction pipeline

## 📋 Useful Commands

```bash
# Start ClickHouse only
docker-compose -f docker-compose.clickhouse.yml up -d clickhouse

# Start with Grafana
docker-compose -f docker-compose.clickhouse.yml --profile monitoring up -d

# Connect to ClickHouse client
docker-compose -f docker-compose.clickhouse.yml --profile client run --rm clickhouse-client

# View logs
docker-compose -f docker-compose.clickhouse.yml logs -f clickhouse

# Stop all services
docker-compose -f docker-compose.clickhouse.yml down

# Reset data (WARNING: Deletes all data)
docker-compose -f docker-compose.clickhouse.yml down -v
```

## 🔐 Security Notes

For production deployments:

1. **Change Default Passwords**:
   ```xml
   <clickhouse>
       <users>
           <tcp_user>
               <password_sha256_hex>your_hashed_password</password_sha256_hex>
               <networks>
                   <ip>::/0</ip>
               </networks>
               <profile>default</profile>
               <quota>default</quota>
           </tcp_user>
       </users>
   </clickhouse>
   ```

2. **Enable SSL**:
   ```xml
   <clickhouse>
       <https_port>8443</https_port>
       <openSSL>
           <server>
               <certificateFile>/etc/ssl/cert.pem</certificateFile>
               <privateKeyFile>/etc/ssl/key.pem</privateKeyFile>
           </server>
       </openSSL>
   </clickhouse>
   ```

3. **Restrict Network Access**:
   ```xml
   <clickhouse>
       <listen_host>127.0.0.1</listen_host>
   </clickhouse>
   ```

---

**Status**: ClickHouse setup ready for AI development  
**Next**: Train ML models with real telemetry data 