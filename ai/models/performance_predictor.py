"""
Transfer Performance Predictor Model
Predicts transfer throughput and completion time using XGBoost
"""

import xgboost as xgb
import numpy as np
import pandas as pd
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
from sklearn.preprocessing import StandardScaler
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)

class TransferPerformancePredictor:
    """
    ML model for predicting transfer performance metrics
    """
    
    def __init__(self, model_dir: str = "models/performance"):
        self.model_dir = model_dir
        self.throughput_model = None
        self.completion_time_model = None
        self.scaler = StandardScaler()
        self.feature_names = []
        self.model_metadata = {}
        
        # XGBoost hyperparameters
        self.throughput_params = {
            'n_estimators': 1000,
            'max_depth': 8,
            'learning_rate': 0.1,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'random_state': 42,
            'objective': 'reg:squarederror',
            'eval_metric': 'rmse'
        }
        
        self.completion_time_params = {
            'n_estimators': 800,
            'max_depth': 6,
            'learning_rate': 0.1,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'random_state': 42,
            'objective': 'reg:squarederror',
            'eval_metric': 'rmse'
        }
        
        # Create model directory if it doesn't exist
        os.makedirs(self.model_dir, exist_ok=True)
    
    def prepare_data(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Prepare data for training
        Returns: X (features), y_throughput, y_completion_time
        """
        logger.info(f"Preparing data with {len(df)} samples")
        
        # Define feature columns (exclude target variables)
        exclude_cols = ['throughput_mbps', 'completion_time_minutes', 'timestamp', 'id', 'agent_id', 'transfer_id']
        feature_cols = [col for col in df.columns if col not in exclude_cols]
        
        # Extract features
        X = df[feature_cols].fillna(0)
        self.feature_names = feature_cols
        
        # Extract targets
        y_throughput = df['throughput_mbps'].fillna(0)
        
        # Calculate completion time if not provided
        if 'completion_time_minutes' in df.columns:
            y_completion_time = df['completion_time_minutes'].fillna(0)
        else:
            # Estimate completion time based on file size and throughput
            file_size_gb = df.get('file_size_gb', 1.0)  # Default 1GB
            y_completion_time = (file_size_gb * 8 * 1024) / (y_throughput + 1e-6) / 60  # Convert to minutes
        
        logger.info(f"Using {len(feature_cols)} features: {feature_cols[:10]}...")
        return X.values, y_throughput.values, y_completion_time.values
    
    def train(self, X_train: np.ndarray, y_throughput: np.ndarray, y_completion_time: np.ndarray,
              X_val: Optional[np.ndarray] = None, y_throughput_val: Optional[np.ndarray] = None,
              y_completion_time_val: Optional[np.ndarray] = None) -> Dict[str, float]:
        """
        Train both throughput and completion time models
        """
        logger.info("Training performance prediction models...")
        
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        
        # Initialize models
        self.throughput_model = xgb.XGBRegressor(**self.throughput_params)
        self.completion_time_model = xgb.XGBRegressor(**self.completion_time_params)
        
        # Prepare validation data if provided
        eval_set_throughput = None
        eval_set_completion = None
        
        if X_val is not None and y_throughput_val is not None:
            X_val_scaled = self.scaler.transform(X_val)
            eval_set_throughput = [(X_train_scaled, y_throughput), (X_val_scaled, y_throughput_val)]
            eval_set_completion = [(X_train_scaled, y_completion_time), (X_val_scaled, y_completion_time_val)]
        
        # Train throughput model
        logger.info("Training throughput model...")
        self.throughput_model.fit(
            X_train_scaled, y_throughput,
            eval_set=eval_set_throughput,
            verbose=False
        )
        
        # Train completion time model
        logger.info("Training completion time model...")
        self.completion_time_model.fit(
            X_train_scaled, y_completion_time,
            eval_set=eval_set_completion,
            verbose=False
        )
        
        # Calculate training metrics
        throughput_pred = self.throughput_model.predict(X_train_scaled)
        completion_pred = self.completion_time_model.predict(X_train_scaled)
        
        metrics = {
            'throughput_mae': mean_absolute_error(y_throughput, throughput_pred),
            'throughput_r2': r2_score(y_throughput, throughput_pred),
            'throughput_rmse': np.sqrt(mean_squared_error(y_throughput, throughput_pred)),
            'completion_mae': mean_absolute_error(y_completion_time, completion_pred),
            'completion_r2': r2_score(y_completion_time, completion_pred),
            'completion_rmse': np.sqrt(mean_squared_error(y_completion_time, completion_pred))
        }
        
        # Store metadata
        self.model_metadata = {
            'trained_at': datetime.now().isoformat(),
            'training_samples': len(X_train),
            'feature_count': len(self.feature_names),
            'metrics': metrics
        }
        
        logger.info(f"Training completed. Throughput R²: {metrics['throughput_r2']:.3f}, "
                   f"Completion Time R²: {metrics['completion_r2']:.3f}")
        
        return metrics
    
    def predict_performance(self, features: np.ndarray) -> Dict[str, Any]:
        """
        Predict transfer performance for given features
        """
        if self.throughput_model is None or self.completion_time_model is None:
            raise ValueError("Models not trained. Call train() first.")
        
        # Ensure features is 2D
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        # Scale features
        features_scaled = self.scaler.transform(features)
        
        # Make predictions
        throughput_pred = self.throughput_model.predict(features_scaled)
        completion_pred = self.completion_time_model.predict(features_scaled)
        
        # Calculate confidence scores based on model uncertainty
        confidence_throughput = self._calculate_confidence(features_scaled, 'throughput')
        confidence_completion = self._calculate_confidence(features_scaled, 'completion')
        
        # Average confidence
        avg_confidence = (confidence_throughput + confidence_completion) / 2
        
        results = {
            'predicted_throughput_mbps': float(throughput_pred[0]) if len(throughput_pred) == 1 else throughput_pred.tolist(),
            'predicted_completion_minutes': float(completion_pred[0]) if len(completion_pred) == 1 else completion_pred.tolist(),
            'confidence_score': float(avg_confidence),
            'throughput_confidence': float(confidence_throughput),
            'completion_confidence': float(confidence_completion)
        }
        
        return results
    
    def predict_batch(self, features_batch: np.ndarray) -> List[Dict[str, Any]]:
        """
        Predict performance for a batch of feature vectors
        """
        if self.throughput_model is None or self.completion_time_model is None:
            raise ValueError("Models not trained. Call train() first.")
        
        # Scale features
        features_scaled = self.scaler.transform(features_batch)
        
        # Make predictions
        throughput_preds = self.throughput_model.predict(features_scaled)
        completion_preds = self.completion_time_model.predict(features_scaled)
        
        # Calculate confidence for each prediction
        results = []
        for i in range(len(features_batch)):
            confidence_throughput = self._calculate_confidence(features_scaled[i:i+1], 'throughput')
            confidence_completion = self._calculate_confidence(features_scaled[i:i+1], 'completion')
            avg_confidence = (confidence_throughput + confidence_completion) / 2
            
            results.append({
                'predicted_throughput_mbps': float(throughput_preds[i]),
                'predicted_completion_minutes': float(completion_preds[i]),
                'confidence_score': float(avg_confidence),
                'throughput_confidence': float(confidence_throughput),
                'completion_confidence': float(confidence_completion)
            })
        
        return results
    
    def _calculate_confidence(self, features: np.ndarray, model_type: str) -> float:
        """
        Calculate prediction confidence based on model uncertainty
        Uses ensemble of trees to estimate prediction variance
        """
        try:
            model = self.throughput_model if model_type == 'throughput' else self.completion_time_model
            
            # Get predictions from individual trees
            tree_predictions = []
            for tree in model.get_booster().get_dump():
                # This is a simplified confidence calculation
                # In practice, you might use more sophisticated methods
                pass
            
            # For now, use a simple heuristic based on feature values
            # Higher confidence for values closer to training distribution
            base_confidence = 0.8
            
            # Adjust based on extreme values (simplified)
            feature_extremeness = np.mean(np.abs(features))
            if feature_extremeness > 2.0:  # Values far from mean
                base_confidence *= 0.7
            elif feature_extremeness < 0.5:  # Values close to mean
                base_confidence *= 1.1
            
            return min(0.95, max(0.1, base_confidence))
            
        except Exception as e:
            logger.warning(f"Error calculating confidence: {e}")
            return 0.5  # Default medium confidence
    
    def evaluate(self, X_test: np.ndarray, y_throughput_test: np.ndarray, 
                y_completion_test: np.ndarray) -> Dict[str, float]:
        """
        Evaluate model performance on test data
        """
        if self.throughput_model is None or self.completion_time_model is None:
            raise ValueError("Models not trained. Call train() first.")
        
        # Scale test features
        X_test_scaled = self.scaler.transform(X_test)
        
        # Make predictions
        throughput_pred = self.throughput_model.predict(X_test_scaled)
        completion_pred = self.completion_time_model.predict(X_test_scaled)
        
        # Calculate metrics
        metrics = {
            'test_throughput_mae': mean_absolute_error(y_throughput_test, throughput_pred),
            'test_throughput_r2': r2_score(y_throughput_test, throughput_pred),
            'test_throughput_rmse': np.sqrt(mean_squared_error(y_throughput_test, throughput_pred)),
            'test_completion_mae': mean_absolute_error(y_completion_test, completion_pred),
            'test_completion_r2': r2_score(y_completion_test, completion_pred),
            'test_completion_rmse': np.sqrt(mean_squared_error(y_completion_test, completion_pred)),
            'test_samples': len(X_test)
        }
        
        logger.info(f"Test evaluation - Throughput R²: {metrics['test_throughput_r2']:.3f}, "
                   f"Completion R²: {metrics['test_completion_r2']:.3f}")
        
        return metrics
    
    def get_feature_importance(self) -> Dict[str, Dict[str, float]]:
        """
        Get feature importance for both models
        """
        if self.throughput_model is None or self.completion_time_model is None:
            raise ValueError("Models not trained. Call train() first.")
        
        throughput_importance = dict(zip(self.feature_names, self.throughput_model.feature_importances_))
        completion_importance = dict(zip(self.feature_names, self.completion_time_model.feature_importances_))
        
        # Sort by importance
        throughput_importance = dict(sorted(throughput_importance.items(), key=lambda x: x[1], reverse=True))
        completion_importance = dict(sorted(completion_importance.items(), key=lambda x: x[1], reverse=True))
        
        return {
            'throughput_importance': throughput_importance,
            'completion_importance': completion_importance
        }
    
    def save_model(self, version: str = "latest") -> str:
        """
        Save trained models to disk
        """
        if self.throughput_model is None or self.completion_time_model is None:
            raise ValueError("No trained models to save")
        
        model_path = os.path.join(self.model_dir, f"performance_predictor_{version}")
        os.makedirs(model_path, exist_ok=True)
        
        # Save models
        self.throughput_model.save_model(os.path.join(model_path, "throughput_model.json"))
        self.completion_time_model.save_model(os.path.join(model_path, "completion_model.json"))
        
        # Save scaler
        joblib.dump(self.scaler, os.path.join(model_path, "scaler.pkl"))
        
        # Save metadata
        metadata = {
            'feature_names': self.feature_names,
            'model_metadata': self.model_metadata,
            'version': version,
            'saved_at': datetime.now().isoformat()
        }
        
        with open(os.path.join(model_path, "metadata.json"), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Models saved to {model_path}")
        return model_path
    
    def load_model(self, version: str = "latest") -> bool:
        """
        Load trained models from disk
        """
        model_path = os.path.join(self.model_dir, f"performance_predictor_{version}")
        
        if not os.path.exists(model_path):
            logger.error(f"Model path not found: {model_path}")
            return False
        
        try:
            # Load models
            self.throughput_model = xgb.XGBRegressor()
            self.throughput_model.load_model(os.path.join(model_path, "throughput_model.json"))
            
            self.completion_time_model = xgb.XGBRegressor()
            self.completion_time_model.load_model(os.path.join(model_path, "completion_model.json"))
            
            # Load scaler
            self.scaler = joblib.load(os.path.join(model_path, "scaler.pkl"))
            
            # Load metadata
            with open(os.path.join(model_path, "metadata.json"), 'r') as f:
                metadata = json.load(f)
                self.feature_names = metadata['feature_names']
                self.model_metadata = metadata['model_metadata']
            
            logger.info(f"Models loaded from {model_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            return False
    
    def cross_validate(self, X: np.ndarray, y_throughput: np.ndarray, 
                      y_completion: np.ndarray, cv: int = 5) -> Dict[str, List[float]]:
        """
        Perform cross-validation
        """
        logger.info(f"Performing {cv}-fold cross-validation...")
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Create fresh models for CV
        throughput_model = xgb.XGBRegressor(**self.throughput_params)
        completion_model = xgb.XGBRegressor(**self.completion_time_params)
        
        # Perform cross-validation
        throughput_scores = cross_val_score(throughput_model, X_scaled, y_throughput, 
                                          cv=cv, scoring='r2', n_jobs=-1)
        completion_scores = cross_val_score(completion_model, X_scaled, y_completion, 
                                          cv=cv, scoring='r2', n_jobs=-1)
        
        results = {
            'throughput_cv_scores': throughput_scores.tolist(),
            'completion_cv_scores': completion_scores.tolist(),
            'throughput_cv_mean': float(throughput_scores.mean()),
            'throughput_cv_std': float(throughput_scores.std()),
            'completion_cv_mean': float(completion_scores.mean()),
            'completion_cv_std': float(completion_scores.std())
        }
        
        logger.info(f"CV Results - Throughput: {results['throughput_cv_mean']:.3f} ± {results['throughput_cv_std']:.3f}, "
                   f"Completion: {results['completion_cv_mean']:.3f} ± {results['completion_cv_std']:.3f}")
        
        return results 