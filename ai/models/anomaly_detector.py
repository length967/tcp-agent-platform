"""
Anomaly Detection System for Transfer Performance
Combines Isolation Forest and LSTM Autoencoder for comprehensive anomaly detection
"""

import numpy as np
import pandas as pd
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import classification_report, confusion_matrix
import tensorflow as tf
from tensorflow.keras.models import Sequential, Model
from tensorflow.keras.layers import LSTM, Dense, RepeatVector, TimeDistributed, Input
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Hybrid anomaly detection system using both statistical and deep learning approaches
    """
    
    def __init__(self, sequence_length: int = 60, model_dir: str = "models/anomaly"):
        self.sequence_length = sequence_length
        self.model_dir = model_dir
        
        # Models
        self.isolation_forest = None
        self.autoencoder = None
        
        # Scalers
        self.statistical_scaler = StandardScaler()
        self.sequence_scaler = MinMaxScaler()
        
        # Feature columns for different approaches
        self.statistical_features = []
        self.sequence_features = []
        
        # Thresholds
        self.isolation_threshold = -0.1
        self.reconstruction_threshold = None
        
        # Model metadata
        self.model_metadata = {}
        
        # Create model directory
        os.makedirs(self.model_dir, exist_ok=True)
    
    def prepare_statistical_data(self, df: pd.DataFrame) -> np.ndarray:
        """
        Prepare data for statistical anomaly detection (Isolation Forest)
        """
        # Select statistical features
        self.statistical_features = [
            'bandwidth_utilization', 'latency_ms', 'packet_loss_rate',
            'cpu_usage', 'memory_usage', 'throughput_mbps',
            'success_rate', 'error_rate', 'concurrent_streams'
        ]
        
        # Filter available columns
        available_features = [col for col in self.statistical_features if col in df.columns]
        
        if not available_features:
            raise ValueError("No statistical features found in data")
        
        logger.info(f"Using {len(available_features)} statistical features: {available_features}")
        
        # Extract and clean data
        X = df[available_features].fillna(0)
        
        return X.values
    
    def prepare_sequence_data(self, df: pd.DataFrame) -> np.ndarray:
        """
        Prepare time series data for LSTM autoencoder
        """
        # Select sequence features
        self.sequence_features = [
            'throughput_mbps', 'latency_ms', 'packet_loss_rate',
            'cpu_usage', 'memory_usage', 'bandwidth_utilization',
            'concurrent_streams', 'chunk_size', 'retry_count', 'compression_ratio'
        ]
        
        # Filter available columns
        available_features = [col for col in self.sequence_features if col in df.columns]
        
        if not available_features:
            raise ValueError("No sequence features found in data")
        
        logger.info(f"Using {len(available_features)} sequence features: {available_features}")
        
        # Sort by timestamp
        df_sorted = df.sort_values('timestamp').reset_index(drop=True)
        
        # Extract features
        feature_data = df_sorted[available_features].fillna(0).values
        
        # Create sequences
        sequences = []
        for i in range(len(feature_data) - self.sequence_length + 1):
            sequences.append(feature_data[i:i + self.sequence_length])
        
        return np.array(sequences)
    
    def _build_autoencoder(self, n_features: int) -> Model:
        """
        Build LSTM autoencoder architecture
        """
        # Encoder
        input_layer = Input(shape=(self.sequence_length, n_features))
        encoded = LSTM(128, activation='relu', return_sequences=True)(input_layer)
        encoded = LSTM(64, activation='relu', return_sequences=False)(encoded)
        
        # Decoder
        decoded = RepeatVector(self.sequence_length)(encoded)
        decoded = LSTM(64, activation='relu', return_sequences=True)(decoded)
        decoded = LSTM(128, activation='relu', return_sequences=True)(decoded)
        decoded = TimeDistributed(Dense(n_features))(decoded)
        
        # Create model
        autoencoder = Model(input_layer, decoded)
        autoencoder.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        return autoencoder
    
    def train(self, df: pd.DataFrame, contamination: float = 0.1) -> Dict[str, Any]:
        """
        Train both statistical and sequence-based anomaly detectors
        """
        logger.info("Training anomaly detection models...")
        
        # Prepare statistical data
        X_statistical = self.prepare_statistical_data(df)
        X_statistical_scaled = self.statistical_scaler.fit_transform(X_statistical)
        
        # Train Isolation Forest
        logger.info("Training Isolation Forest...")
        self.isolation_forest = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=200,
            max_samples='auto',
            max_features=1.0
        )
        self.isolation_forest.fit(X_statistical_scaled)
        
        # Prepare sequence data
        X_sequences = self.prepare_sequence_data(df)
        if len(X_sequences) > 0:
            X_sequences_scaled = self.sequence_scaler.fit_transform(
                X_sequences.reshape(-1, X_sequences.shape[-1])
            ).reshape(X_sequences.shape)
            
            # Build and train autoencoder
            logger.info("Training LSTM Autoencoder...")
            n_features = X_sequences.shape[-1]
            self.autoencoder = self._build_autoencoder(n_features)
            
            # Callbacks
            early_stopping = EarlyStopping(
                monitor='loss',
                patience=10,
                restore_best_weights=True
            )
            reduce_lr = ReduceLROnPlateau(
                monitor='loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6
            )
            
            # Train autoencoder
            history = self.autoencoder.fit(
                X_sequences_scaled, X_sequences_scaled,
                epochs=100,
                batch_size=32,
                validation_split=0.2,
                callbacks=[early_stopping, reduce_lr],
                verbose=0
            )
            
            # Calculate reconstruction threshold (95th percentile)
            reconstructed = self.autoencoder.predict(X_sequences_scaled, verbose=0)
            reconstruction_errors = np.mean(np.power(X_sequences_scaled - reconstructed, 2), axis=(1, 2))
            self.reconstruction_threshold = np.percentile(reconstruction_errors, 95)
            
            logger.info(f"Reconstruction threshold: {self.reconstruction_threshold:.6f}")
        
        # Calculate training metrics
        metrics = self._calculate_training_metrics(df)
        
        # Store metadata
        self.model_metadata = {
            'trained_at': datetime.now().isoformat(),
            'training_samples': len(df),
            'contamination_rate': contamination,
            'sequence_length': self.sequence_length,
            'statistical_features': self.statistical_features,
            'sequence_features': self.sequence_features,
            'isolation_threshold': self.isolation_threshold,
            'reconstruction_threshold': self.reconstruction_threshold,
            'metrics': metrics
        }
        
        logger.info("Anomaly detection training completed")
        return metrics
    
    def detect_anomalies(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Detect anomalies using both statistical and sequence-based methods
        """
        if self.isolation_forest is None:
            raise ValueError("Models not trained. Call train() first.")
        
        results = {
            'statistical_anomalies': [],
            'sequence_anomalies': [],
            'combined_anomalies': [],
            'anomaly_scores': {},
            'summary': {}
        }
        
        # Statistical anomaly detection
        X_statistical = self.prepare_statistical_data(df)
        X_statistical_scaled = self.statistical_scaler.transform(X_statistical)
        
        # Isolation Forest predictions
        isolation_scores = self.isolation_forest.decision_function(X_statistical_scaled)
        isolation_anomalies = self.isolation_forest.predict(X_statistical_scaled) == -1
        
        results['statistical_anomalies'] = isolation_anomalies.tolist()
        results['anomaly_scores']['isolation_scores'] = isolation_scores.tolist()
        
        # Sequence-based anomaly detection
        if self.autoencoder is not None:
            X_sequences = self.prepare_sequence_data(df)
            if len(X_sequences) > 0:
                X_sequences_scaled = self.sequence_scaler.transform(
                    X_sequences.reshape(-1, X_sequences.shape[-1])
                ).reshape(X_sequences.shape)
                
                # Reconstruction errors
                reconstructed = self.autoencoder.predict(X_sequences_scaled, verbose=0)
                reconstruction_errors = np.mean(np.power(X_sequences_scaled - reconstructed, 2), axis=(1, 2))
                
                sequence_anomalies = reconstruction_errors > self.reconstruction_threshold
                
                # Pad sequence anomalies to match original data length
                padded_sequence_anomalies = np.zeros(len(df), dtype=bool)
                padded_sequence_anomalies[self.sequence_length-1:] = sequence_anomalies
                
                results['sequence_anomalies'] = padded_sequence_anomalies.tolist()
                results['anomaly_scores']['reconstruction_errors'] = reconstruction_errors.tolist()
        
        # Combine anomalies (either method detects anomaly)
        combined_anomalies = np.array(results['statistical_anomalies'])
        if results['sequence_anomalies']:
            combined_anomalies = combined_anomalies | np.array(results['sequence_anomalies'])
        
        results['combined_anomalies'] = combined_anomalies.tolist()
        
        # Summary statistics
        total_samples = len(df)
        statistical_count = sum(results['statistical_anomalies'])
        sequence_count = sum(results['sequence_anomalies']) if results['sequence_anomalies'] else 0
        combined_count = sum(results['combined_anomalies'])
        
        results['summary'] = {
            'total_samples': total_samples,
            'statistical_anomalies': statistical_count,
            'sequence_anomalies': sequence_count,
            'combined_anomalies': combined_count,
            'statistical_rate': statistical_count / total_samples,
            'sequence_rate': sequence_count / total_samples if total_samples > 0 else 0,
            'combined_rate': combined_count / total_samples
        }
        
        return results
    
    def detect_single_anomaly(self, features: Dict[str, float], 
                            sequence_data: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Detect anomaly for a single data point
        """
        if self.isolation_forest is None:
            raise ValueError("Models not trained. Call train() first.")
        
        # Prepare statistical features
        statistical_vector = np.array([[features.get(col, 0) for col in self.statistical_features]])
        statistical_scaled = self.statistical_scaler.transform(statistical_vector)
        
        # Statistical anomaly detection
        isolation_score = self.isolation_forest.decision_function(statistical_scaled)[0]
        is_statistical_anomaly = isolation_score < self.isolation_threshold
        
        result = {
            'is_anomaly': is_statistical_anomaly,
            'isolation_score': float(isolation_score),
            'reconstruction_error': None,
            'confidence': abs(isolation_score),
            'anomaly_type': []
        }
        
        # Sequence-based detection if data provided
        if sequence_data is not None and self.autoencoder is not None:
            if sequence_data.shape[0] == self.sequence_length:
                # Reshape and scale
                sequence_scaled = self.sequence_scaler.transform(
                    sequence_data.reshape(-1, sequence_data.shape[-1])
                ).reshape(1, *sequence_data.shape)
                
                # Reconstruction error
                reconstructed = self.autoencoder.predict(sequence_scaled, verbose=0)
                reconstruction_error = np.mean(np.power(sequence_scaled - reconstructed, 2))
                
                is_sequence_anomaly = reconstruction_error > self.reconstruction_threshold
                
                result['reconstruction_error'] = float(reconstruction_error)
                result['is_anomaly'] = result['is_anomaly'] or is_sequence_anomaly
        
        # Determine anomaly types
        if is_statistical_anomaly:
            result['anomaly_type'].append('statistical')
        if result['reconstruction_error'] and result['reconstruction_error'] > self.reconstruction_threshold:
            result['anomaly_type'].append('sequential')
        
        return result
    
    def _calculate_training_metrics(self, df: pd.DataFrame) -> Dict[str, float]:
        """
        Calculate training performance metrics
        """
        # For unsupervised learning, we can only estimate metrics
        # In practice, you would have labeled anomaly data for validation
        
        # Detect anomalies on training data
        results = self.detect_anomalies(df)
        
        metrics = {
            'training_samples': len(df),
            'detected_anomalies': results['summary']['combined_anomalies'],
            'anomaly_rate': results['summary']['combined_rate'],
            'statistical_anomaly_rate': results['summary']['statistical_rate'],
            'sequence_anomaly_rate': results['summary']['sequence_rate']
        }
        
        return metrics
    
    def save_models(self, version: str = None) -> str:
        """
        Save trained models and metadata
        """
        if version is None:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        version_dir = os.path.join(self.model_dir, version)
        os.makedirs(version_dir, exist_ok=True)
        
        # Save Isolation Forest
        if self.isolation_forest:
            joblib.dump(self.isolation_forest, os.path.join(version_dir, 'isolation_forest.pkl'))
        
        # Save LSTM Autoencoder
        if self.autoencoder:
            self.autoencoder.save(os.path.join(version_dir, 'autoencoder.keras'))
        
        # Save scalers
        joblib.dump(self.statistical_scaler, os.path.join(version_dir, 'statistical_scaler.pkl'))
        joblib.dump(self.sequence_scaler, os.path.join(version_dir, 'sequence_scaler.pkl'))
        
        # Save metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'w') as f:
            json.dump(self.model_metadata, f, indent=2)
        
        logger.info(f"Models saved to {version_dir}")
        return version_dir
    
    def load_models(self, version: str) -> None:
        """
        Load trained models and metadata
        """
        version_dir = os.path.join(self.model_dir, version)
        
        if not os.path.exists(version_dir):
            raise ValueError(f"Model version {version} not found")
        
        # Load Isolation Forest
        isolation_path = os.path.join(version_dir, 'isolation_forest.pkl')
        if os.path.exists(isolation_path):
            self.isolation_forest = joblib.load(isolation_path)
        
        # Load LSTM Autoencoder
        autoencoder_path = os.path.join(version_dir, 'autoencoder.keras')
        if os.path.exists(autoencoder_path):
            self.autoencoder = tf.keras.models.load_model(autoencoder_path)
        
        # Load scalers
        self.statistical_scaler = joblib.load(os.path.join(version_dir, 'statistical_scaler.pkl'))
        self.sequence_scaler = joblib.load(os.path.join(version_dir, 'sequence_scaler.pkl'))
        
        # Load metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'r') as f:
            self.model_metadata = json.load(f)
        
        # Restore thresholds
        self.isolation_threshold = self.model_metadata.get('isolation_threshold', -0.1)
        self.reconstruction_threshold = self.model_metadata.get('reconstruction_threshold')
        self.statistical_features = self.model_metadata.get('statistical_features', [])
        self.sequence_features = self.model_metadata.get('sequence_features', [])
        
        logger.info(f"Models loaded from {version_dir}")

if __name__ == "__main__":
    # Example usage
    import pandas as pd
    
    # Create sample data for testing
    np.random.seed(42)
    n_samples = 1000
    
    sample_data = pd.DataFrame({
        'timestamp': pd.date_range('2024-01-01', periods=n_samples, freq='1min'),
        'bandwidth_utilization': np.random.normal(70, 15, n_samples),
        'latency_ms': np.random.normal(50, 10, n_samples),
        'packet_loss_rate': np.random.exponential(0.01, n_samples),
        'cpu_usage': np.random.normal(60, 20, n_samples),
        'memory_usage': np.random.normal(75, 15, n_samples),
        'throughput_mbps': np.random.normal(100, 25, n_samples),
        'success_rate': np.random.normal(98, 2, n_samples),
        'error_rate': np.random.exponential(0.02, n_samples),
        'concurrent_streams': np.random.poisson(3, n_samples),
        'chunk_size': np.random.choice([64, 128, 256, 512, 1024], n_samples),
        'retry_count': np.random.poisson(0.5, n_samples),
        'compression_ratio': np.random.normal(0.7, 0.1, n_samples)
    })
    
    # Add some anomalies
    anomaly_indices = np.random.choice(n_samples, size=50, replace=False)
    sample_data.loc[anomaly_indices, 'latency_ms'] *= 5  # High latency anomalies
    sample_data.loc[anomaly_indices[:25], 'packet_loss_rate'] *= 10  # High loss anomalies
    
    # Train detector
    detector = AnomalyDetector(sequence_length=30)
    metrics = detector.train(sample_data, contamination=0.05)
    
    print("Training Metrics:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    
    # Detect anomalies
    results = detector.detect_anomalies(sample_data)
    
    print(f"\nAnomaly Detection Results:")
    print(f"  Total samples: {results['summary']['total_samples']}")
    print(f"  Statistical anomalies: {results['summary']['statistical_anomalies']}")
    print(f"  Sequence anomalies: {results['summary']['sequence_anomalies']}")
    print(f"  Combined anomalies: {results['summary']['combined_anomalies']}")
    print(f"  Combined anomaly rate: {results['summary']['combined_rate']:.2%}") 