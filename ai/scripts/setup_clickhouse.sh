#!/bin/bash

# ClickHouse Setup Script for TCP Agent AI Platform
# This script sets up ClickHouse for telemetry data storage and ML training

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CLICKHOUSE_VERSION=${CLICKHOUSE_VERSION:-"23.8"}
CLICKHOUSE_HOST=${CLICKHOUSE_HOST:-"localhost"}
CLICKHOUSE_PORT=${CLICKHOUSE_PORT:-"8123"}
CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE:-"tcp_optimization"}
CLICKHOUSE_USER=${CLICKHOUSE_USER:-"tcp_user"}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD:-"tcp_password"}

echo -e "${BLUE}🚀 TCP Agent AI Platform - ClickHouse Setup${NC}"
echo "=============================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available. Please install Docker Compose.${NC}"
    exit 1
fi

# Function to check if ClickHouse is running
check_clickhouse() {
    local max_attempts=20
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for ClickHouse to be ready...${NC}"
    
    # Give ClickHouse some time to start up initially
    sleep 10
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ClickHouse is ready!${NC}"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: ClickHouse not ready yet..."
        sleep 3
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ ClickHouse failed to start within expected time${NC}"
    return 1
}

# Function to initialize ClickHouse schema
initialize_schema() {
    echo -e "${BLUE}📊 Initializing ClickHouse schema...${NC}"
    
    # Create database
    curl -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        -d "CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}"
    
    # Create telemetry table
    curl -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        -d "CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DATABASE}.tcp_telemetry (
            timestamp DateTime64(3),
            agent_id String,
            transfer_id String,
            project_id String,
            bandwidth_mbps Float64,
            latency_ms Float64,
            packet_loss_rate Float64,
            jitter_ms Float64,
            rtt_ms Float64,
            throughput_mbps Float64,
            bytes_transferred UInt64,
            transfer_duration_ms UInt64,
            chunk_size UInt32,
            concurrent_connections UInt16,
            cpu_usage Float64,
            memory_usage Float64,
            disk_io_mbps Float64,
            network_utilization Float64,
            hour_of_day UInt8,
            day_of_week UInt8,
            is_weekend UInt8,
            predicted_throughput Float64,
            actual_throughput Float64,
            optimization_applied String,
            improvement_percent Float64
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(timestamp)
        ORDER BY (agent_id, timestamp)
        TTL toDateTime(timestamp) + INTERVAL 1 YEAR"
    
    # Create model performance table
    curl -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        -d "CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DATABASE}.ml_model_performance (
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
        TTL toDateTime(timestamp) + INTERVAL 6 MONTH"
    
    echo -e "${GREEN}✅ Schema initialized successfully${NC}"
}

# Function to insert sample data
insert_sample_data() {
    echo -e "${BLUE}📝 Inserting sample data...${NC}"
    
    # Insert a few sample records
    curl -X POST "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
        -d "INSERT INTO ${CLICKHOUSE_DATABASE}.tcp_telemetry VALUES
        (now(), 'agent-001', 'transfer-001', 'project-001', 100.0, 50.0, 0.01, 5.0, 100.0, 85.0, 104857600, 12000, 65536, 4, 45.0, 60.0, 200.0, 75.0, 14, 2, 0, 80.0, 85.0, 'chunk_size_optimized', 6.25),
        (now() - INTERVAL 1 MINUTE, 'agent-002', 'transfer-002', 'project-001', 150.0, 30.0, 0.005, 3.0, 60.0, 120.0, 52428800, 8000, 131072, 6, 35.0, 55.0, 250.0, 80.0, 14, 2, 0, 115.0, 120.0, 'connection_count_optimized', 4.35)"
    
    echo -e "${GREEN}✅ Sample data inserted${NC}"
}

# Function to run tests
run_tests() {
    echo -e "${BLUE}🧪 Running ClickHouse tests...${NC}"
    
    # Test basic connectivity
    result=$(curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" -d "SELECT 1")
    if [ "$result" = "1" ]; then
        echo -e "${GREEN}✅ Basic connectivity test passed${NC}"
    else
        echo -e "${RED}❌ Basic connectivity test failed${NC}"
        return 1
    fi
    
    # Test database exists
    result=$(curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" -d "SHOW DATABASES" | grep -c "${CLICKHOUSE_DATABASE}")
    if [ "$result" -gt 0 ]; then
        echo -e "${GREEN}✅ Database exists${NC}"
    else
        echo -e "${RED}❌ Database not found${NC}"
        return 1
    fi
    
    # Test table exists and has data
    count=$(curl -s "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" -d "SELECT count() FROM ${CLICKHOUSE_DATABASE}.tcp_telemetry")
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✅ Telemetry table has $count records${NC}"
    else
        echo -e "${YELLOW}⚠️ Telemetry table is empty${NC}"
    fi
    
    echo -e "${GREEN}✅ All tests passed!${NC}"
}

# Main setup process
main() {
    echo -e "${BLUE}Starting ClickHouse setup...${NC}"
    
    # Change to the docker directory
    cd "$(dirname "$0")/../docker"
    
    # Start ClickHouse using Docker Compose
    echo -e "${BLUE}🐳 Starting ClickHouse container...${NC}"
    docker-compose -f docker-compose.clickhouse.yml up -d
    
    # Wait for ClickHouse to be ready
    if ! check_clickhouse; then
        echo -e "${RED}❌ Setup failed: ClickHouse not responding${NC}"
        exit 1
    fi
    
    # Initialize schema
    initialize_schema
    
    # Insert sample data
    insert_sample_data
    
    # Run tests
    run_tests
    
    echo ""
    echo -e "${GREEN}🎉 ClickHouse setup completed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Connection Details:${NC}"
    echo "  Host: ${CLICKHOUSE_HOST}"
    echo "  Port: ${CLICKHOUSE_PORT}"
    echo "  Database: ${CLICKHOUSE_DATABASE}"
    echo "  Web UI: http://${CLICKHOUSE_HOST}:8123/play"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "  1. Install Python dependencies: pip install -r ../requirements.txt"
    echo "  2. Run training pipeline: python ../train_with_clickhouse.py"
    echo "  3. Check logs: docker-compose -f docker-compose.clickhouse.yml logs -f"
    echo ""
    echo -e "${YELLOW}To stop ClickHouse:${NC}"
    echo "  docker-compose -f docker-compose.clickhouse.yml down"
}

# Handle command line arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "test")
        run_tests
        ;;
    "schema")
        check_clickhouse && initialize_schema
        ;;
    "sample-data")
        check_clickhouse && insert_sample_data
        ;;
    "stop")
        cd "$(dirname "$0")/../docker"
        docker-compose -f docker-compose.clickhouse.yml down
        echo -e "${GREEN}✅ ClickHouse stopped${NC}"
        ;;
    "restart")
        cd "$(dirname "$0")/../docker"
        docker-compose -f docker-compose.clickhouse.yml restart
        check_clickhouse
        echo -e "${GREEN}✅ ClickHouse restarted${NC}"
        ;;
    "clean")
        cd "$(dirname "$0")/../docker"
        docker-compose -f docker-compose.clickhouse.yml down -v
        echo -e "${GREEN}✅ ClickHouse stopped and volumes removed${NC}"
        ;;
    *)
        echo "Usage: $0 {setup|test|schema|sample-data|stop|restart|clean}"
        echo ""
        echo "Commands:"
        echo "  setup       - Full setup (default)"
        echo "  test        - Run connectivity tests"
        echo "  schema      - Initialize database schema"
        echo "  sample-data - Insert sample data"
        echo "  stop        - Stop ClickHouse"
        echo "  restart     - Restart ClickHouse"
        echo "  clean       - Stop and remove all data"
        exit 1
        ;;
esac 