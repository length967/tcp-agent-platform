"""
Feature Engineering Pipeline for TCP Agent AI Optimization
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from sklearn.preprocessing import StandardScaler, LabelEncoder
import logging

logger = logging.getLogger(__name__)

class FeatureEngineer:
    """
    Handles feature extraction and engineering for ML models
    """
    
    def __init__(self):
        self.scalers = {}
        self.encoders = {}
        self.feature_cache = {}
    
    def extract_temporal_features(self, timestamp: datetime) -> Dict[str, Any]:
        """Extract time-based features"""
        return {
            'hour_of_day': timestamp.hour,
            'day_of_week': timestamp.weekday(),
            'is_weekend': timestamp.weekday() >= 5,
            'is_business_hours': 9 <= timestamp.hour <= 17,
            'quarter_of_year': (timestamp.month - 1) // 3 + 1,
            'week_of_year': timestamp.isocalendar()[1],
            'month_of_year': timestamp.month,
            'day_of_month': timestamp.day,
            'is_month_end': timestamp.day >= 28,  # Rough approximation
            'is_month_start': timestamp.day <= 3
        }
    
    def calculate_network_health_score(self, metrics: Dict[str, float]) -> float:
        """
        Calculate composite network health metric
        Higher score = better network conditions
        """
        try:
            # Normalize packet loss (0-1 to 0-100 scale, then invert)
            packet_loss_score = max(0, 100 - (metrics.get('packet_loss_rate', 0) * 100))
            
            # Normalize latency (cap at 1000ms for scoring)
            latency_score = max(0, 100 - min(metrics.get('latency_ms', 0) / 10, 100))
            
            # Bandwidth utilization (higher is better up to ~80%)
            bandwidth_util = metrics.get('bandwidth_utilization', 0)
            bandwidth_score = bandwidth_util if bandwidth_util <= 80 else max(0, 160 - bandwidth_util)
            
            # Weighted composite score
            health_score = (
                packet_loss_score * 0.3 +
                latency_score * 0.3 +
                bandwidth_score * 0.4
            )
            
            return min(100, max(0, health_score))
            
        except Exception as e:
            logger.error(f"Error calculating network health score: {e}")
            return 50.0  # Default neutral score
    
    def create_rolling_features(self, df: pd.DataFrame, windows: List[int] = [5, 15, 30, 60]) -> pd.DataFrame:
        """
        Create rolling window features for time series data
        Windows are in minutes
        """
        if 'timestamp' not in df.columns:
            logger.warning("No timestamp column found for rolling features")
            return df
        
        # Ensure timestamp is datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp')
        
        # Create rolling features for key metrics
        metrics_to_roll = ['throughput_mbps', 'latency_ms', 'cpu_usage', 'memory_usage']
        
        for metric in metrics_to_roll:
            if metric in df.columns:
                for window in windows:
                    # Use simple window size instead of time-based rolling for now
                    window_size = max(1, window // 5)  # Approximate records per window
                    
                    # Rolling mean
                    df[f'{metric}_rolling_{window}m'] = df[metric].rolling(
                        window=window_size, min_periods=1
                    ).mean()
                    
                    # Rolling standard deviation
                    df[f'{metric}_rolling_std_{window}m'] = df[metric].rolling(
                        window=window_size, min_periods=1
                    ).std()
                    
                    # Rolling min/max
                    df[f'{metric}_rolling_min_{window}m'] = df[metric].rolling(
                        window=window_size, min_periods=1
                    ).min()
                    
                    df[f'{metric}_rolling_max_{window}m'] = df[metric].rolling(
                        window=window_size, min_periods=1
                    ).max()
        
        return df
    
    def extract_system_features(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        """Extract system-level features"""
        features = {}
        
        # CPU features
        cpu_usage = metrics.get('cpu_usage', 0)
        features['cpu_usage'] = cpu_usage
        features['cpu_stress_level'] = self._categorize_usage(cpu_usage, [50, 80, 95])
        
        # Memory features
        memory_usage = metrics.get('memory_usage', 0)
        features['memory_usage'] = memory_usage
        features['memory_pressure'] = self._categorize_usage(memory_usage, [60, 80, 90])
        
        # Disk I/O features
        disk_io_wait = metrics.get('disk_io_wait', 0)
        features['disk_io_wait'] = disk_io_wait
        features['disk_bottleneck'] = 1 if disk_io_wait > 10 else 0
        
        # Load average
        load_avg = metrics.get('load_average', 0)
        features['load_average'] = load_avg
        features['system_overloaded'] = 1 if load_avg > 2.0 else 0
        
        return features
    
    def extract_transfer_features(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        """Extract transfer-specific features"""
        features = {}
        
        # Basic transfer metrics
        features['throughput_mbps'] = metrics.get('throughput_mbps', 0)
        features['chunk_size'] = metrics.get('chunk_size', 65536)  # Default 64KB
        features['concurrent_streams'] = metrics.get('concurrent_connections', metrics.get('concurrent_streams', 1))
        features['retry_count'] = metrics.get('retry_count', 0)
        features['compression_ratio'] = metrics.get('compression_ratio', 1.0)
        
        # Derived features
        features['has_retries'] = 1 if features['retry_count'] > 0 else 0
        features['high_concurrency'] = 1 if features['concurrent_streams'] > 4 else 0
        features['compression_effective'] = 1 if features['compression_ratio'] > 1.5 else 0
        
        # Efficiency metrics
        if features['concurrent_streams'] > 0:
            features['throughput_per_stream'] = features['throughput_mbps'] / features['concurrent_streams']
        else:
            features['throughput_per_stream'] = 0
            
        return features
    
    def extract_network_features(self, metrics: Dict[str, Any]) -> Dict[str, float]:
        """Extract network-specific features"""
        features = {}
        
        # Basic network metrics - calculate bandwidth utilization if not provided
        bandwidth_mbps = metrics.get('bandwidth_mbps', 100)
        throughput_mbps = metrics.get('throughput_mbps', 0)
        features['bandwidth_utilization'] = metrics.get('bandwidth_utilization', 
                                                       min(100, (throughput_mbps / bandwidth_mbps * 100) if bandwidth_mbps > 0 else 0))
        features['latency_ms'] = metrics.get('latency_ms', 50)
        features['packet_loss_rate'] = metrics.get('packet_loss_rate', 0.01)
        features['connection_count'] = metrics.get('concurrent_connections', metrics.get('connection_count', 1))
        features['tcp_window_size'] = metrics.get('tcp_window_size', 65536)
        
        # Network quality indicators
        features['low_latency'] = 1 if features['latency_ms'] < 50 else 0
        features['high_latency'] = 1 if features['latency_ms'] > 200 else 0
        features['packet_loss_present'] = 1 if features['packet_loss_rate'] > 0.001 else 0
        features['high_packet_loss'] = 1 if features['packet_loss_rate'] > 0.01 else 0
        
        # Network type encoding (if available)
        network_type = metrics.get('network_type', 'unknown')
        features['network_type_wifi'] = 1 if network_type == 'wifi' else 0
        features['network_type_ethernet'] = 1 if network_type == 'ethernet' else 0
        features['network_type_cellular'] = 1 if network_type == 'cellular' else 0
        
        # Network health score
        features['network_health_score'] = self.calculate_network_health_score(metrics)
        
        return features
    
    def create_feature_vector(self, raw_data: Dict[str, Any]) -> Dict[str, float]:
        """
        Create a complete feature vector from raw telemetry data
        """
        features = {}
        
        # Extract timestamp features
        if 'timestamp' in raw_data:
            timestamp = pd.to_datetime(raw_data['timestamp'])
            features.update(self.extract_temporal_features(timestamp))
        
        # Extract different types of features
        features.update(self.extract_system_features(raw_data))
        features.update(self.extract_transfer_features(raw_data))
        features.update(self.extract_network_features(raw_data))
        
        # Add quality metrics if available
        features['success_rate'] = raw_data.get('success_rate', 100.0)
        features['error_rate'] = raw_data.get('error_rate', 0.0)
        features['user_satisfaction_score'] = raw_data.get('user_satisfaction_score', 3)
        
        return features
    
    def prepare_training_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare data for model training by applying all feature engineering steps
        """
        logger.info(f"Preparing training data for {len(df)} samples")
        
        # Create rolling features
        df = self.create_rolling_features(df)
        
        # Create feature vectors for each row
        feature_rows = []
        for _, row in df.iterrows():
            features = self.create_feature_vector(row.to_dict())
            feature_rows.append(features)
        
        # Convert to DataFrame
        feature_df = pd.DataFrame(feature_rows)
        
        # Handle missing values
        feature_df = feature_df.fillna(0)
        
        # Scale features if needed
        numeric_columns = feature_df.select_dtypes(include=[np.number]).columns
        if len(numeric_columns) > 0:
            if 'scaler' not in self.scalers:
                self.scalers['scaler'] = StandardScaler()
                feature_df[numeric_columns] = self.scalers['scaler'].fit_transform(feature_df[numeric_columns])
            else:
                feature_df[numeric_columns] = self.scalers['scaler'].transform(feature_df[numeric_columns])
        
        logger.info(f"Generated {len(feature_df.columns)} features")
        return feature_df
    
    def _categorize_usage(self, value: float, thresholds: List[float]) -> int:
        """Categorize usage levels based on thresholds"""
        for i, threshold in enumerate(thresholds):
            if value < threshold:
                return i
        return len(thresholds)
    
    def get_feature_importance(self, model, feature_names: List[str]) -> Dict[str, float]:
        """
        Extract feature importance from trained model
        """
        try:
            if hasattr(model, 'feature_importances_'):
                importance_dict = dict(zip(feature_names, model.feature_importances_))
                # Sort by importance
                return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
            else:
                logger.warning("Model does not have feature_importances_ attribute")
                return {}
        except Exception as e:
            logger.error(f"Error extracting feature importance: {e}")
            return {}
    
    def validate_features(self, features: Dict[str, Any]) -> bool:
        """
        Validate that features are within expected ranges
        """
        try:
            # Check for required features
            required_features = ['throughput_mbps', 'latency_ms', 'cpu_usage', 'memory_usage']
            for feature in required_features:
                if feature not in features:
                    logger.warning(f"Missing required feature: {feature}")
                    return False
            
            # Check value ranges
            if features.get('cpu_usage', 0) < 0 or features.get('cpu_usage', 0) > 100:
                logger.warning("CPU usage out of valid range (0-100)")
                return False
                
            if features.get('memory_usage', 0) < 0 or features.get('memory_usage', 0) > 100:
                logger.warning("Memory usage out of valid range (0-100)")
                return False
                
            if features.get('latency_ms', 0) < 0:
                logger.warning("Latency cannot be negative")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"Error validating features: {e}")
            return False 