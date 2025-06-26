"""
Train ML Models with Real ClickHouse Data
Demonstrates end-to-end training pipeline from ClickHouse to trained models
"""

import asyncio
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from clickhouse_client import create_clickhouse_client, TelemetryRecord
from models.performance_predictor import TransferPerformancePredictor
from models.anomaly_detector_simple import AnomalyDetector
from features.engineering import FeatureEngineer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MLTrainingPipeline:
    """
    Complete ML training pipeline using ClickHouse data
    """
    
    def __init__(self, clickhouse_host: str = 'localhost', clickhouse_port: int = 8123):
        self.clickhouse_host = clickhouse_host
        self.clickhouse_port = clickhouse_port
        self.client = None
        self.feature_engineer = FeatureEngineer()
        
        # Models
        self.performance_predictor = TransferPerformancePredictor()
        self.anomaly_detector = AnomalyDetector()
        
    async def initialize(self):
        """Initialize ClickHouse connection"""
        try:
            self.client = await create_clickhouse_client(
                host=self.clickhouse_host,
                port=self.clickhouse_port
            )
            logger.info("✅ Connected to ClickHouse")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to connect to ClickHouse: {e}")
            return False
    
    async def generate_sample_data(self, num_records: int = 1000):
        """
        Generate sample telemetry data for testing
        In production, this would come from real TCP agents
        """
        logger.info(f"Generating {num_records} sample telemetry records...")
        
        records = []
        base_time = datetime.now() - timedelta(days=7)
        
        for i in range(num_records):
            # Simulate realistic network conditions
            hour = (base_time + timedelta(minutes=i*10)).hour
            is_peak_hour = 9 <= hour <= 17  # Business hours
            
            # Network conditions vary by time of day
            if is_peak_hour:
                bandwidth = np.random.normal(80, 20)  # Lower during peak
                latency = np.random.normal(80, 30)    # Higher during peak
                packet_loss = np.random.exponential(0.02)
            else:
                bandwidth = np.random.normal(120, 30)  # Higher off-peak
                latency = np.random.normal(40, 15)     # Lower off-peak
                packet_loss = np.random.exponential(0.005)
            
            # Ensure realistic bounds
            bandwidth = max(10, min(1000, bandwidth))
            latency = max(10, min(500, latency))
            packet_loss = max(0, min(0.1, packet_loss))
            
            # System metrics
            cpu_usage = np.random.normal(50, 20)
            memory_usage = np.random.normal(60, 25)
            
            # Transfer settings
            chunk_size = np.random.choice([32*1024, 64*1024, 128*1024, 256*1024])
            concurrent_connections = np.random.randint(1, 9)
            
            # Calculate realistic throughput based on conditions
            base_throughput = bandwidth * 0.7  # 70% efficiency baseline
            latency_penalty = max(0, (latency - 50) / 100)  # Penalty for high latency
            loss_penalty = packet_loss * 100  # Packet loss penalty
            cpu_penalty = max(0, (cpu_usage - 80) / 100)  # CPU bottleneck
            
            throughput = base_throughput * (1 - latency_penalty - loss_penalty - cpu_penalty)
            throughput = max(1, min(bandwidth * 0.95, throughput))
            
            # File size affects transfer duration
            file_size = np.random.lognormal(15, 2)  # Log-normal distribution for file sizes
            file_size = max(1024*1024, min(10*1024*1024*1024, file_size))  # 1MB to 10GB
            
            transfer_duration = (file_size / (throughput * 1024 * 1024 / 8)) * 1000  # ms
            
            record = TelemetryRecord(
                timestamp=base_time + timedelta(minutes=i*10),
                agent_id=f"agent-{(i % 10) + 1:03d}",
                transfer_id=f"transfer-{i+1:06d}",
                project_id=f"project-{(i % 5) + 1:02d}",
                
                # Network metrics
                bandwidth_mbps=bandwidth,
                latency_ms=latency,
                packet_loss_rate=packet_loss,
                jitter_ms=np.random.exponential(5),
                rtt_ms=latency * 2,
                
                # Transfer metrics
                throughput_mbps=throughput,
                bytes_transferred=int(file_size),
                transfer_duration_ms=int(transfer_duration),
                chunk_size=chunk_size,
                concurrent_connections=concurrent_connections,
                
                # System metrics
                cpu_usage=max(0, min(100, cpu_usage)),
                memory_usage=max(0, min(100, memory_usage)),
                disk_io_mbps=np.random.normal(150, 50),
                network_utilization=min(100, throughput / bandwidth * 100),
                
                # Environmental
                hour_of_day=hour,
                day_of_week=(base_time + timedelta(minutes=i*10)).weekday(),
                is_weekend=(base_time + timedelta(minutes=i*10)).weekday() >= 5,
                
                # Optimization results (simulated)
                predicted_throughput=throughput * np.random.normal(1.0, 0.1),
                actual_throughput=throughput,
                optimization_applied=np.random.choice([
                    '', 'chunk_size_optimized', 'connection_count_optimized', 
                    'bandwidth_throttled', 'retry_optimized'
                ], p=[0.3, 0.2, 0.2, 0.15, 0.15]),
                improvement_percent=np.random.normal(5, 15)
            )
            
            records.append(record)
        
        # Insert into ClickHouse
        await self.client.insert_telemetry(records)
        logger.info(f"✅ Inserted {len(records)} sample records")
        
    async def load_training_data(self, hours: int = 24 * 7) -> pd.DataFrame:
        """Load training data from ClickHouse"""
        logger.info(f"Loading training data from last {hours} hours...")
        
        df = await self.client.get_training_data(hours=hours)
        
        if df.empty:
            logger.warning("No training data found in ClickHouse")
            return df
            
        logger.info(f"✅ Loaded {len(df)} training records")
        
        # Basic data quality checks
        logger.info(f"Data quality:")
        logger.info(f"  - Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
        logger.info(f"  - Unique agents: {df['agent_id'].nunique()}")
        logger.info(f"  - Avg throughput: {df['throughput_mbps'].mean():.2f} Mbps")
        logger.info(f"  - Missing values: {df.isnull().sum().sum()}")
        
        return df
    
    async def prepare_features(self, df: pd.DataFrame) -> Dict[str, np.ndarray]:
        """Prepare features using the feature engineering pipeline"""
        logger.info("Preparing features...")
        
        if df.empty:
            return {}
        
        # Use feature engineer to prepare training data
        feature_df = self.feature_engineer.prepare_training_data(df)
        
        # Convert to feature arrays (handle missing columns gracefully)
        def safe_extract_features(df, columns, default_values):
            result = []
            for i, col in enumerate(columns):
                if col in df.columns:
                    result.append(df[col].values)
                else:
                    logger.warning(f"Column {col} not found, using default value {default_values[i]}")
                    result.append(np.full(len(df), default_values[i]))
            return np.column_stack(result) if result else np.array([]).reshape(len(df), 0)
        
        features = {
            'network_features': safe_extract_features(feature_df, 
                ['bandwidth_utilization', 'latency_ms', 'packet_loss_rate', 'network_health_score'],
                [75.0, 50.0, 0.01, 75.0]),
            'system_features': safe_extract_features(feature_df,
                ['cpu_usage', 'memory_usage', 'cpu_stress_level', 'memory_pressure'],
                [50.0, 60.0, 1.0, 1.0]),
            'transfer_features': safe_extract_features(feature_df,
                ['chunk_size', 'concurrent_streams', 'throughput_per_stream'],
                [65536, 4, 25.0]),
            'temporal_features': safe_extract_features(feature_df,
                ['hour_of_day', 'day_of_week', 'is_weekend', 'is_business_hours'],
                [12, 2, 0, 1])
        }
        
        # Prepare target variables
        targets = {
            'throughput': df['throughput_mbps'].values,
            'duration': df['transfer_duration_ms'].values,
            'anomaly_labels': self._generate_anomaly_labels(df)
        }
        
        logger.info(f"✅ Prepared features: {list(features.keys())}")
        logger.info(f"✅ Feature matrix shape: {features['network_features'].shape}")
        
        return {'features': features, 'targets': targets}
    
    def _generate_anomaly_labels(self, df: pd.DataFrame) -> np.ndarray:
        """
        Generate anomaly labels based on statistical outliers
        In production, these would come from actual anomaly reports
        """
        # Define anomalies as transfers with unusually low throughput
        throughput_threshold = df['throughput_mbps'].quantile(0.1)
        latency_threshold = df['latency_ms'].quantile(0.9)
        loss_threshold = df['packet_loss_rate'].quantile(0.95)
        
        anomalies = (
            (df['throughput_mbps'] < throughput_threshold) |
            (df['latency_ms'] > latency_threshold) |
            (df['packet_loss_rate'] > loss_threshold)
        )
        
        return anomalies.astype(int).values
    
    async def train_performance_predictor(self, data: Dict):
        """Train the performance prediction model"""
        logger.info("Training performance predictor...")
        
        if not data or 'features' not in data:
            logger.error("No data available for training")
            return
        
        features = data['features']
        targets = data['targets']
        
        # Combine all features into a single matrix
        feature_matrix = np.column_stack([
            features['network_features'],
            features['system_features'],
            features['transfer_features'],
            features['temporal_features']
        ])
        
        # Prepare data for training
        X, y_throughput, y_completion_time = self.performance_predictor.prepare_data(
            pd.DataFrame(feature_matrix, columns=[f'feature_{i}' for i in range(feature_matrix.shape[1])])
            .assign(throughput_mbps=targets['throughput'], completion_time_minutes=targets['duration']/60000)
        )
        
        try:
            # Train the model
            metrics = self.performance_predictor.train(X, y_throughput, y_completion_time)
            logger.info("✅ Performance predictor trained successfully")
            
            # Record model performance in ClickHouse
            await self._record_model_performance(
                'performance_predictor', 
                '1.0.0',
                metrics,
                len(feature_matrix)
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to train performance predictor: {e}")
    
    async def train_anomaly_detector(self, data: Dict):
        """Train the anomaly detection model"""
        logger.info("Training anomaly detector...")
        
        if not data or 'features' not in data:
            logger.error("No data available for training")
            return
        
        features = data['features']
        targets = data['targets']
        
        # Prepare sequence data for LSTM
        feature_matrix = np.column_stack([
            features['network_features'],
            features['system_features'],
            features['transfer_features']
        ])
        
        try:
            # Create DataFrame for anomaly detector
            anomaly_df = pd.DataFrame(feature_matrix, columns=[f'feature_{i}' for i in range(feature_matrix.shape[1])])
            anomaly_df['timestamp'] = pd.date_range(start='2024-01-01', periods=len(anomaly_df), freq='10min')
            
            # Add required columns for anomaly detector
            anomaly_df['bandwidth_utilization'] = features['network_features'][:, 0] if len(features['network_features']) > 0 else 50
            anomaly_df['latency_ms'] = features['network_features'][:, 1] if len(features['network_features']) > 1 else 50
            anomaly_df['packet_loss_rate'] = features['network_features'][:, 2] if len(features['network_features']) > 2 else 0.01
            anomaly_df['cpu_usage'] = features['system_features'][:, 0] if len(features['system_features']) > 0 else 50
            anomaly_df['memory_usage'] = features['system_features'][:, 1] if len(features['system_features']) > 1 else 60
            anomaly_df['throughput_mbps'] = targets['throughput']
            anomaly_df['success_rate'] = 95.0
            anomaly_df['error_rate'] = 0.05
            anomaly_df['concurrent_streams'] = 4
            
            metrics = self.anomaly_detector.train(anomaly_df)
            logger.info("✅ Anomaly detector trained successfully")
            
            # Record model performance
            await self._record_model_performance(
                'anomaly_detector',
                '1.0.0', 
                metrics,
                len(feature_matrix)
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to train anomaly detector: {e}")
    
    async def _record_model_performance(self, model_name: str, version: str, 
                                      metrics: Dict[str, float], training_samples: int):
        """Record model performance metrics in ClickHouse"""
        try:
            await self.client.record_model_performance(
                model_name=model_name,
                model_version=version,
                metrics=metrics,
                training_samples=training_samples,
                inference_time_ms=10.0  # Placeholder
            )
        except Exception as e:
            logger.error(f"Failed to record model performance: {e}")
    
    async def test_predictions(self):
        """Test trained models with sample predictions"""
        logger.info("Testing trained models...")
        
        # Get recent data for testing
        test_data = await self.client.get_agent_features("agent-001", hours=1)
        
        if not test_data:
            logger.warning("No test data available")
            return
        
        # Test performance predictor
        if hasattr(self.performance_predictor, 'model') and self.performance_predictor.model:
            try:
                # Create feature vector for prediction
                features = np.array([[
                    test_data.get('avg_bandwidth', 100),
                    test_data.get('avg_latency', 50),
                    test_data.get('avg_packet_loss', 0.01),
                    test_data.get('avg_cpu', 50),
                    test_data.get('avg_memory', 60),
                    64*1024,  # chunk_size
                    4,        # concurrent_connections
                    14,       # hour_of_day
                    2,        # day_of_week
                    0         # is_weekend
                ]])
                
                prediction = self.performance_predictor.predict(features)
                logger.info(f"✅ Performance prediction: {prediction}")
                
            except Exception as e:
                logger.error(f"❌ Performance prediction failed: {e}")
        
        # Test anomaly detector
        if hasattr(self.anomaly_detector, 'model') and self.anomaly_detector.model:
            try:
                # Create sequence for anomaly detection
                sequence = np.array([[[
                    test_data.get('avg_bandwidth', 100),
                    test_data.get('avg_latency', 50),
                    test_data.get('avg_packet_loss', 0.01),
                    test_data.get('avg_cpu', 50),
                    test_data.get('avg_memory', 60)
                ]]])
                
                anomaly_score = self.anomaly_detector.predict(sequence)
                logger.info(f"✅ Anomaly score: {anomaly_score}")
                
            except Exception as e:
                logger.error(f"❌ Anomaly detection failed: {e}")
    
    async def save_models(self, model_dir: str = "trained_models"):
        """Save trained models to disk"""
        os.makedirs(model_dir, exist_ok=True)
        
        try:
            # Save performance predictor
            self.performance_predictor.save_model(
                os.path.join(model_dir, "performance_predictor.joblib")
            )
            logger.info(f"✅ Saved performance predictor to {model_dir}")
            
            # Save anomaly detector
            self.anomaly_detector.save_model(
                os.path.join(model_dir, "anomaly_detector.h5")
            )
            logger.info(f"✅ Saved anomaly detector to {model_dir}")
            
        except Exception as e:
            logger.error(f"❌ Failed to save models: {e}")
    
    async def cleanup(self):
        """Cleanup resources"""
        if self.client:
            self.client.close()

async def main():
    """Main training pipeline"""
    pipeline = MLTrainingPipeline()
    
    try:
        # Initialize
        if not await pipeline.initialize():
            return
        
        # Generate sample data (remove this in production)
        await pipeline.generate_sample_data(num_records=2000)
        
        # Load training data
        df = await pipeline.load_training_data(hours=24 * 7)
        
        if df.empty:
            logger.error("No training data available")
            return
        
        # Prepare features
        data = await pipeline.prepare_features(df)
        
        # Train models
        await pipeline.train_performance_predictor(data)
        await pipeline.train_anomaly_detector(data)
        
        # Test predictions
        await pipeline.test_predictions()
        
        # Save models
        await pipeline.save_models()
        
        logger.info("🎉 Training pipeline completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Training pipeline failed: {e}")
        
    finally:
        await pipeline.cleanup()

if __name__ == "__main__":
    asyncio.run(main()) 