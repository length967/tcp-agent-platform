"""
ClickHouse Client for AI Transfer Optimization
Handles telemetry data storage, retrieval, and ML feature extraction
"""

import logging
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import clickhouse_connect
from clickhouse_connect import get_client
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)

@dataclass
class TelemetryRecord:
    """Single telemetry record structure"""
    timestamp: datetime
    agent_id: str
    transfer_id: str
    project_id: str
    
    # Network metrics
    bandwidth_mbps: float
    latency_ms: float
    packet_loss_rate: float
    jitter_ms: float
    rtt_ms: float
    
    # Transfer metrics
    throughput_mbps: float
    bytes_transferred: int
    transfer_duration_ms: int
    chunk_size: int
    concurrent_connections: int
    
    # System metrics
    cpu_usage: float
    memory_usage: float
    disk_io_mbps: float
    network_utilization: float
    
    # Environmental
    hour_of_day: int
    day_of_week: int
    is_weekend: bool
    
    # Optimization results
    predicted_throughput: Optional[float] = None
    actual_throughput: Optional[float] = None
    optimization_applied: Optional[str] = None
    improvement_percent: Optional[float] = None

class ClickHouseClient:
    """
    ClickHouse client for AI telemetry data management
    """
    
    def __init__(self, host: str = 'localhost', port: int = 8123, 
                 username: str = 'tcp_user', password: str = 'tcp_password', 
                 database: str = 'tcp_optimization'):
        """
        Initialize ClickHouse client
        
        Args:
            host: ClickHouse server host
            port: ClickHouse HTTP port (default 8123)
            username: Database username
            password: Database password
            database: Database name
        """
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.database = database
        self.client = None
        
    async def connect(self):
        """Establish connection to ClickHouse"""
        try:
            self.client = get_client(
                host=self.host,
                port=self.port,
                username=self.username,
                password=self.password,
                database=self.database
            )
            
            # Test connection
            result = self.client.query('SELECT 1')
            logger.info(f"Connected to ClickHouse at {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to ClickHouse: {e}")
            return False
    
    async def initialize_schema(self):
        """Create database and tables if they don't exist"""
        try:
            # Create database
            self.client.command(f'CREATE DATABASE IF NOT EXISTS {self.database}')
            
            # Create telemetry table
            create_telemetry_table = """
            CREATE TABLE IF NOT EXISTS tcp_telemetry (
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
            TTL timestamp + INTERVAL 1 YEAR
            """
            
            self.client.command(create_telemetry_table)
            
            # Create model performance table
            create_model_table = """
            CREATE TABLE IF NOT EXISTS ml_model_performance (
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
            TTL timestamp + INTERVAL 6 MONTH
            """
            
            self.client.command(create_model_table)
            
            # Create materialized view for real-time analytics
            create_analytics_view = """
            CREATE MATERIALIZED VIEW IF NOT EXISTS transfer_analytics_mv
            ENGINE = SummingMergeTree()
            ORDER BY (agent_id, toStartOfHour(timestamp))
            AS SELECT
                agent_id,
                toStartOfHour(timestamp) as hour,
                count() as transfer_count,
                avg(throughput_mbps) as avg_throughput,
                max(throughput_mbps) as max_throughput,
                avg(latency_ms) as avg_latency,
                avg(packet_loss_rate) as avg_packet_loss,
                sum(bytes_transferred) as total_bytes
            FROM tcp_telemetry
            GROUP BY agent_id, hour
            """
            
            self.client.command(create_analytics_view)
            
            logger.info("ClickHouse schema initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize schema: {e}")
            return False
    
    async def insert_telemetry(self, records: List[TelemetryRecord]):
        """
        Insert telemetry records in batch
        
        Args:
            records: List of telemetry records to insert
        """
        if not records:
            return
            
        try:
            # Convert records to list of tuples
            data = []
            for record in records:
                data.append((
                    record.timestamp,
                    record.agent_id,
                    record.transfer_id,
                    record.project_id,
                    record.bandwidth_mbps,
                    record.latency_ms,
                    record.packet_loss_rate,
                    record.jitter_ms,
                    record.rtt_ms,
                    record.throughput_mbps,
                    record.bytes_transferred,
                    record.transfer_duration_ms,
                    record.chunk_size,
                    record.concurrent_connections,
                    record.cpu_usage,
                    record.memory_usage,
                    record.disk_io_mbps,
                    record.network_utilization,
                    record.hour_of_day,
                    record.day_of_week,
                    1 if record.is_weekend else 0,
                    record.predicted_throughput or 0.0,
                    record.actual_throughput or 0.0,
                    record.optimization_applied or '',
                    record.improvement_percent or 0.0
                ))
            
            # Insert batch
            self.client.insert('tcp_telemetry', data)
            logger.info(f"Inserted {len(records)} telemetry records")
            
        except Exception as e:
            logger.error(f"Failed to insert telemetry: {e}")
            raise
    
    async def get_training_data(self, agent_id: Optional[str] = None, 
                               hours: int = 24 * 7) -> pd.DataFrame:
        """
        Retrieve training data for ML models
        
        Args:
            agent_id: Specific agent ID (None for all agents)
            hours: Hours of historical data to retrieve
            
        Returns:
            DataFrame with training features and targets
        """
        try:
            where_clause = f"WHERE timestamp >= now() - INTERVAL {hours} HOUR"
            if agent_id:
                where_clause += f" AND agent_id = '{agent_id}'"
            
            query = f"""
            SELECT 
                timestamp,
                agent_id,
                bandwidth_mbps,
                latency_ms,
                packet_loss_rate,
                jitter_ms,
                rtt_ms,
                cpu_usage,
                memory_usage,
                disk_io_mbps,
                network_utilization,
                hour_of_day,
                day_of_week,
                is_weekend,
                chunk_size,
                concurrent_connections,
                throughput_mbps,
                transfer_duration_ms,
                bytes_transferred
            FROM tcp_telemetry
            {where_clause}
            ORDER BY timestamp DESC
            """
            
            result = self.client.query_df(query)
            logger.info(f"Retrieved {len(result)} training records")
            return result
            
        except Exception as e:
            logger.error(f"Failed to get training data: {e}")
            return pd.DataFrame()
    
    async def get_agent_features(self, agent_id: str, hours: int = 24) -> Dict[str, float]:
        """
        Get aggregated features for a specific agent
        
        Args:
            agent_id: Agent identifier
            hours: Hours of historical data to analyze
            
        Returns:
            Dictionary of computed features
        """
        try:
            query = f"""
            SELECT 
                avg(bandwidth_mbps) as avg_bandwidth,
                avg(latency_ms) as avg_latency,
                avg(packet_loss_rate) as avg_packet_loss,
                avg(jitter_ms) as avg_jitter,
                avg(rtt_ms) as avg_rtt,
                max(throughput_mbps) as max_throughput,
                avg(throughput_mbps) as avg_throughput,
                min(throughput_mbps) as min_throughput,
                stddevPop(throughput_mbps) as throughput_std,
                count() as transfer_count,
                sum(bytes_transferred) as total_bytes,
                avg(cpu_usage) as avg_cpu,
                avg(memory_usage) as avg_memory,
                avg(disk_io_mbps) as avg_disk_io,
                avg(network_utilization) as avg_network_util
            FROM tcp_telemetry 
            WHERE agent_id = '{agent_id}' 
              AND timestamp >= now() - INTERVAL {hours} HOUR
            """
            
            result = self.client.query(query).result_rows
            if result:
                row = result[0]
                return {
                    'avg_bandwidth': row[0] or 0.0,
                    'avg_latency': row[1] or 0.0,
                    'avg_packet_loss': row[2] or 0.0,
                    'avg_jitter': row[3] or 0.0,
                    'avg_rtt': row[4] or 0.0,
                    'max_throughput': row[5] or 0.0,
                    'avg_throughput': row[6] or 0.0,
                    'min_throughput': row[7] or 0.0,
                    'throughput_std': row[8] or 0.0,
                    'transfer_count': row[9] or 0,
                    'total_bytes': row[10] or 0,
                    'avg_cpu': row[11] or 0.0,
                    'avg_memory': row[12] or 0.0,
                    'avg_disk_io': row[13] or 0.0,
                    'avg_network_util': row[14] or 0.0
                }
            else:
                return {}
                
        except Exception as e:
            logger.error(f"Failed to get agent features: {e}")
            return {}
    
    async def get_real_time_analytics(self, minutes: int = 60) -> Dict[str, Any]:
        """
        Get real-time transfer analytics
        
        Args:
            minutes: Minutes of recent data to analyze
            
        Returns:
            Dictionary with analytics data
        """
        try:
            query = f"""
            SELECT 
                toStartOfMinute(timestamp) as minute,
                count() as transfer_count,
                avg(throughput_mbps) as avg_throughput,
                max(throughput_mbps) as max_throughput,
                avg(latency_ms) as avg_latency,
                avg(packet_loss_rate) as avg_packet_loss,
                countIf(optimization_applied != '') as optimized_transfers,
                avg(improvement_percent) as avg_improvement
            FROM tcp_telemetry 
            WHERE timestamp >= now() - INTERVAL {minutes} MINUTE
            GROUP BY minute
            ORDER BY minute DESC
            LIMIT 60
            """
            
            result = self.client.query_df(query)
            
            return {
                'timeline': result.to_dict('records'),
                'summary': {
                    'total_transfers': int(result['transfer_count'].sum()),
                    'avg_throughput': float(result['avg_throughput'].mean()),
                    'peak_throughput': float(result['max_throughput'].max()),
                    'avg_latency': float(result['avg_latency'].mean()),
                    'optimization_rate': float(result['optimized_transfers'].sum() / result['transfer_count'].sum() * 100) if result['transfer_count'].sum() > 0 else 0.0,
                    'avg_improvement': float(result['avg_improvement'].mean())
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get real-time analytics: {e}")
            return {}
    
    async def record_model_performance(self, model_name: str, model_version: str,
                                     metrics: Dict[str, float], training_samples: int,
                                     inference_time_ms: float):
        """
        Record ML model performance metrics
        
        Args:
            model_name: Name of the model
            model_version: Version identifier
            metrics: Dictionary of performance metrics
            training_samples: Number of training samples used
            inference_time_ms: Average inference time
        """
        try:
            data = [(
                datetime.now(),
                model_name,
                model_version,
                metrics.get('accuracy', 0.0),
                metrics.get('mae', 0.0),
                metrics.get('rmse', 0.0),
                metrics.get('r2_score', 0.0),
                training_samples,
                inference_time_ms
            )]
            
            self.client.insert('ml_model_performance', data)
            logger.info(f"Recorded performance for model {model_name} v{model_version}")
            
        except Exception as e:
            logger.error(f"Failed to record model performance: {e}")
    
    async def cleanup_old_data(self, days: int = 365):
        """
        Manually cleanup data older than specified days
        
        Args:
            days: Number of days to keep
        """
        try:
            query = f"""
            ALTER TABLE tcp_telemetry 
            DELETE WHERE timestamp < now() - INTERVAL {days} DAY
            """
            
            self.client.command(query)
            logger.info(f"Cleaned up telemetry data older than {days} days")
            
        except Exception as e:
            logger.error(f"Failed to cleanup old data: {e}")
    
    def close(self):
        """Close the ClickHouse connection"""
        if self.client:
            self.client.close()
            logger.info("ClickHouse connection closed")

# Utility functions for easy access
async def create_clickhouse_client(host: str = 'localhost', port: int = 8123,
                                 username: str = 'tcp_user', password: str = 'tcp_password',
                                 database: str = 'tcp_optimization') -> ClickHouseClient:
    """
    Create and initialize ClickHouse client
    
    Returns:
        Initialized ClickHouseClient instance
    """
    client = ClickHouseClient(host, port, username, password, database)
    
    if await client.connect():
        await client.initialize_schema()
        return client
    else:
        raise ConnectionError("Failed to connect to ClickHouse")

# Example usage
if __name__ == "__main__":
    async def main():
        # Initialize client
        client = await create_clickhouse_client()
        
        # Create sample telemetry record
        sample_record = TelemetryRecord(
            timestamp=datetime.now(),
            agent_id="agent-001",
            transfer_id="transfer-001",
            project_id="project-001",
            bandwidth_mbps=100.0,
            latency_ms=50.0,
            packet_loss_rate=0.01,
            jitter_ms=5.0,
            rtt_ms=100.0,
            throughput_mbps=85.0,
            bytes_transferred=1024*1024*100,  # 100MB
            transfer_duration_ms=12000,
            chunk_size=64*1024,
            concurrent_connections=4,
            cpu_usage=45.0,
            memory_usage=60.0,
            disk_io_mbps=200.0,
            network_utilization=75.0,
            hour_of_day=14,
            day_of_week=2,
            is_weekend=False,
            predicted_throughput=80.0,
            actual_throughput=85.0,
            optimization_applied="chunk_size_optimized",
            improvement_percent=6.25
        )
        
        # Insert sample data
        await client.insert_telemetry([sample_record])
        
        # Get features for the agent
        features = await client.get_agent_features("agent-001")
        print("Agent features:", features)
        
        # Get real-time analytics
        analytics = await client.get_real_time_analytics()
        print("Real-time analytics:", analytics)
        
        client.close()
    
    # Run example
    asyncio.run(main()) 