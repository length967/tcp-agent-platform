"""
Simple Anomaly Detection System for Transfer Performance
Uses only scikit-learn for compatibility (no TensorFlow dependency)
"""

import numpy as np
import pandas as pd
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.covariance import EllipticEnvelope
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Simple anomaly detection system using only statistical approaches
    """
    
    def __init__(self, model_dir: str = "models/anomaly"):
        self.model_dir = model_dir
        
        # Models
        self.isolation_forest = None
        self.elliptic_envelope = None
        
        # Scalers
        self.scaler = StandardScaler()
        
        # Feature columns
        self.features = []
        
        # Model metadata
        self.model_metadata = {}
        
        # Create model directory
        os.makedirs(self.model_dir, exist_ok=True)
    
    def prepare_data(self, df: pd.DataFrame) -> np.ndarray:
        """
        Prepare data for anomaly detection
        """
        # Select features for anomaly detection
        preferred_features = [
            'bandwidth_utilization', 'latency_ms', 'packet_loss_rate',
            'cpu_usage', 'memory_usage', 'throughput_mbps',
            'concurrent_streams', 'chunk_size', 'retry_count'
        ]
        
        # Filter available columns
        available_features = [col for col in preferred_features if col in df.columns]
        
        if not available_features:
            # Use any numeric columns if our preferred features aren't available
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            available_features = [col for col in numeric_cols if col not in ['timestamp']]
        
        if not available_features:
            raise ValueError("No suitable features found in data")
        
        logger.info(f"Using {len(available_features)} features: {available_features}")
        self.features = available_features
        
        # Extract and clean data
        X = df[available_features].fillna(0)
        
        return X.values
    
    def train(self, df: pd.DataFrame, contamination: float = 0.1) -> Dict[str, Any]:
        """
        Train anomaly detection models
        """
        logger.info("Training anomaly detection models...")
        
        # Prepare data
        X = self.prepare_data(df)
        X_scaled = self.scaler.fit_transform(X)
        
        # Train Isolation Forest
        logger.info("Training Isolation Forest...")
        self.isolation_forest = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100
        )
        self.isolation_forest.fit(X_scaled)
        
        # Train Elliptic Envelope
        logger.info("Training Elliptic Envelope...")
        try:
            self.elliptic_envelope = EllipticEnvelope(
                contamination=contamination,
                random_state=42
            )
            self.elliptic_envelope.fit(X_scaled)
        except Exception as e:
            logger.warning(f"Could not train Elliptic Envelope: {e}")
            self.elliptic_envelope = None
        
        # Calculate training metrics
        metrics = self._calculate_training_metrics(X_scaled)
        
        # Store metadata
        self.model_metadata = {
            'training_date': datetime.now().isoformat(),
            'n_samples': len(X),
            'n_features': len(self.features),
            'features': self.features,
            'contamination': contamination,
            'metrics': metrics
        }
        
        logger.info("Anomaly detection training completed")
        return metrics
    
    def detect_anomalies(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Detect anomalies in new data
        """
        if self.isolation_forest is None:
            raise ValueError("Models not trained. Call train() first.")
        
        # Prepare data
        X = df[self.features].fillna(0).values
        X_scaled = self.scaler.transform(X)
        
        # Get predictions from isolation forest
        isolation_predictions = self.isolation_forest.predict(X_scaled)
        isolation_scores = self.isolation_forest.score_samples(X_scaled)
        
        # Use isolation forest as primary detector
        combined_predictions = isolation_predictions
        
        # Calculate confidence scores
        confidence_scores = np.abs(isolation_scores)
        
        # Create results
        results = {
            'predictions': combined_predictions,
            'isolation_predictions': isolation_predictions,
            'isolation_scores': isolation_scores,
            'confidence_scores': confidence_scores,
            'anomaly_indices': np.where(combined_predictions == -1)[0].tolist(),
            'n_anomalies': np.sum(combined_predictions == -1),
            'anomaly_rate': np.mean(combined_predictions == -1)
        }
        
        logger.info(f"Detected {results['n_anomalies']} anomalies out of {len(df)} samples")
        
        return results
    
    def _calculate_training_metrics(self, X_scaled: np.ndarray) -> Dict[str, float]:
        """
        Calculate training performance metrics
        """
        # Get predictions on training data
        isolation_predictions = self.isolation_forest.predict(X_scaled)
        
        # Calculate basic statistics
        isolation_anomaly_rate = np.mean(isolation_predictions == -1)
        
        return {
            'isolation_anomaly_rate': float(isolation_anomaly_rate),
            'n_features_used': len(self.features),
            'training_samples': len(X_scaled)
        }
    
    def save_models(self, version: str = None) -> str:
        """
        Save trained models and metadata
        """
        if version is None:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        version_dir = os.path.join(self.model_dir, version)
        os.makedirs(version_dir, exist_ok=True)
        
        # Save models
        if self.isolation_forest:
            joblib.dump(self.isolation_forest, os.path.join(version_dir, 'isolation_forest.joblib'))
        
        # Save scaler
        joblib.dump(self.scaler, os.path.join(version_dir, 'scaler.joblib'))
        
        # Save metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'w') as f:
            json.dump(self.model_metadata, f, indent=2)
        
        logger.info(f"Models saved to {version_dir}")
        return version
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get model performance metrics
        """
        return self.model_metadata.get('metrics', {})
    
    def load_models(self, version: str) -> None:
        """
        Load trained models and metadata
        """
        version_dir = os.path.join(self.model_dir, version)
        
        if not os.path.exists(version_dir):
            raise ValueError(f"Model version {version} not found")
        
        # Load models
        isolation_path = os.path.join(version_dir, 'isolation_forest.joblib')
        if os.path.exists(isolation_path):
            self.isolation_forest = joblib.load(isolation_path)
        
        # Load scaler
        scaler_path = os.path.join(version_dir, 'scaler.joblib')
        if os.path.exists(scaler_path):
            self.scaler = joblib.load(scaler_path)
        
        # Load metadata
        metadata_path = os.path.join(version_dir, 'metadata.json')
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                self.model_metadata = json.load(f)
                self.features = self.model_metadata.get('features', [])
        
        logger.info(f"Models loaded from {version_dir}") 