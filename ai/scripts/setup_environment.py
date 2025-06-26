#!/usr/bin/env python3
"""
Environment Setup Script for TCP Agent AI Platform
Handles Python environment setup, dependency installation, and configuration validation
"""

import os
import sys
import subprocess
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
import argparse

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class EnvironmentSetup:
    """Environment setup and validation for AI platform"""
    
    def __init__(self, project_root: Optional[str] = None):
        self.project_root = Path(project_root) if project_root else Path(__file__).parent.parent
        self.ai_dir = self.project_root
        self.requirements_file = self.ai_dir / "requirements.txt"
        
    def check_python_version(self) -> bool:
        """Check if Python version is compatible"""
        logger.info("🐍 Checking Python version...")
        
        version = sys.version_info
        if version.major < 3 or (version.major == 3 and version.minor < 8):
            logger.error(f"❌ Python 3.8+ required, found {version.major}.{version.minor}")
            return False
        
        logger.info(f"✅ Python {version.major}.{version.minor}.{version.micro} is compatible")
        return True
    
    def check_virtual_environment(self) -> bool:
        """Check if running in virtual environment"""
        logger.info("🏠 Checking virtual environment...")
        
        if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            logger.info("✅ Running in virtual environment")
            return True
        else:
            logger.warning("⚠️ Not running in virtual environment")
            logger.info("Consider creating one: python -m venv venv && source venv/bin/activate")
            return False
    
    def install_dependencies(self, force: bool = False) -> bool:
        """Install Python dependencies"""
        logger.info("📦 Installing dependencies...")
        
        try:
            # Install core dependencies first to avoid conflicts
            core_deps = [
                "torch", "xgboost", "scikit-learn", "numpy", "pandas", 
                "clickhouse-connect", "python-dotenv", "joblib"
            ]
            
            cmd = [sys.executable, "-m", "pip", "install"] + core_deps
            if force:
                cmd.append("--force-reinstall")
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                logger.info("✅ Dependencies installed successfully")
                return True
            else:
                logger.error(f"❌ Failed to install dependencies: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error installing dependencies: {e}")
            return False
    
    def check_clickhouse_connectivity(self) -> bool:
        """Check ClickHouse connectivity"""
        logger.info("🔗 Checking ClickHouse connectivity...")
        
        try:
            import requests
            response = requests.get("http://localhost:8123/", timeout=5)
            if response.status_code == 200:
                logger.info("✅ ClickHouse is accessible")
                return True
            else:
                logger.warning(f"⚠️ ClickHouse returned status {response.status_code}")
                return False
        except ImportError:
            logger.warning("⚠️ requests library not available, skipping ClickHouse check")
            return False
        except Exception as e:
            logger.warning(f"⚠️ ClickHouse not accessible: {e}")
            logger.info("Run: ./scripts/setup_clickhouse.sh to start ClickHouse")
            return False
    
    def validate_imports(self) -> Dict[str, bool]:
        """Validate that key imports work"""
        logger.info("🔍 Validating imports...")
        
        imports_to_check = [
            ("torch", "PyTorch"),
            # ("tensorflow", "TensorFlow"),  # Temporarily disabled due to Python 3.13 compatibility
            ("xgboost", "XGBoost"),
            ("sklearn", "scikit-learn"),
            ("pandas", "Pandas"),
            ("numpy", "NumPy"),
            ("clickhouse_connect", "ClickHouse Connect"),
        ]
        
        results = {}
        for module, name in imports_to_check:
            try:
                __import__(module)
                logger.info(f"✅ {name} import successful")
                results[name] = True
            except ImportError as e:
                logger.error(f"❌ {name} import failed: {e}")
                results[name] = False
        
        return results
    
    def create_directories(self) -> bool:
        """Create necessary directories"""
        logger.info("📁 Creating directories...")
        
        directories = [
            self.ai_dir / "models" / "trained",
            self.ai_dir / "models" / "anomaly",
            self.ai_dir / "models" / "performance",
            self.ai_dir / "models" / "resource",
            self.ai_dir / "models" / "scheduling",
            self.ai_dir / "logs",
            self.ai_dir / "data" / "cache",
            self.ai_dir / "data" / "temp",
        ]
        
        for directory in directories:
            try:
                directory.mkdir(parents=True, exist_ok=True)
                logger.info(f"✅ Created directory: {directory}")
            except Exception as e:
                logger.error(f"❌ Failed to create directory {directory}: {e}")
                return False
        
        return True
    
    def create_config_file(self) -> bool:
        """Create default configuration file"""
        logger.info("⚙️ Creating configuration file...")
        
        config_file = self.ai_dir / "config.json"
        
        default_config = {
            "clickhouse": {
                "host": "localhost",
                "port": 8123,
                "database": "tcp_optimization",
                "username": "default",
                "password": ""
            },
            "models": {
                "performance_predictor": {
                    "model_dir": "models/performance",
                    "retrain_interval_hours": 24
                },
                "anomaly_detector": {
                    "model_dir": "models/anomaly",
                    "retrain_interval_hours": 12
                },
                "resource_allocator": {
                    "model_dir": "models/resource",
                    "retrain_interval_hours": 6
                },
                "scheduling_optimizer": {
                    "model_dir": "models/scheduling",
                    "retrain_interval_hours": 8
                }
            },
            "training": {
                "batch_size": 64,
                "validation_split": 0.2,
                "early_stopping_patience": 10,
                "max_training_time_hours": 2
            },
            "logging": {
                "level": "INFO",
                "file": "logs/ai_platform.log",
                "max_file_size_mb": 100,
                "backup_count": 5
            }
        }
        
        try:
            with open(config_file, 'w') as f:
                json.dump(default_config, f, indent=2)
            logger.info(f"✅ Configuration file created: {config_file}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to create configuration file: {e}")
            return False
    
    def run_basic_tests(self) -> bool:
        """Run basic functionality tests"""
        logger.info("🧪 Running basic tests...")
        
        try:
            # Test ClickHouse client
            sys.path.insert(0, str(self.ai_dir))
            from clickhouse_client import create_clickhouse_client
            logger.info("✅ ClickHouse client module loaded")
            
            # Test feature engineering
            from features.engineering import FeatureEngineer
            fe = FeatureEngineer()
            logger.info("✅ Feature engineering module loaded")
            
            # Test model imports (skip TensorFlow-dependent models for now)
            from models.performance_predictor import TransferPerformancePredictor
            predictor = TransferPerformancePredictor()
            logger.info("✅ Performance predictor model loaded")
            
            # Test basic functionality
            import pandas as pd
            import numpy as np
            test_data = pd.DataFrame({'test': [1, 2, 3]})
            logger.info("✅ Basic data processing test passed")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Basic tests failed: {e}")
            return False
    
    def setup(self, force_reinstall: bool = False, skip_clickhouse: bool = False) -> bool:
        """Run complete setup process"""
        logger.info("🚀 Starting AI Platform Environment Setup")
        logger.info("=" * 50)
        
        success = True
        
        # Check Python version
        if not self.check_python_version():
            success = False
        
        # Check virtual environment
        self.check_virtual_environment()
        
        # Install dependencies
        if not self.install_dependencies(force=force_reinstall):
            success = False
        
        # Create directories
        if not self.create_directories():
            success = False
        
        # Create config file
        if not self.create_config_file():
            success = False
        
        # Validate imports
        import_results = self.validate_imports()
        if not all(import_results.values()):
            logger.warning("⚠️ Some imports failed - check dependency installation")
        
        # Check ClickHouse connectivity
        if not skip_clickhouse:
            self.check_clickhouse_connectivity()
        
        # Run basic tests
        if not self.run_basic_tests():
            success = False
        
        logger.info("=" * 50)
        if success:
            logger.info("🎉 Environment setup completed successfully!")
            logger.info("")
            logger.info("Next steps:")
            logger.info("1. Start ClickHouse: ./scripts/setup_clickhouse.sh")
            logger.info("2. Run training pipeline: python train_with_clickhouse.py")
            logger.info("3. Check configuration: cat config.json")
        else:
            logger.error("❌ Environment setup completed with errors")
            logger.error("Please resolve the issues above before proceeding")
        
        return success

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Setup AI Platform Environment")
    parser.add_argument("--force-reinstall", action="store_true", 
                       help="Force reinstall all dependencies")
    parser.add_argument("--skip-clickhouse", action="store_true",
                       help="Skip ClickHouse connectivity check")
    parser.add_argument("--project-root", type=str,
                       help="Project root directory")
    
    args = parser.parse_args()
    
    setup = EnvironmentSetup(project_root=args.project_root)
    success = setup.setup(
        force_reinstall=args.force_reinstall,
        skip_clickhouse=args.skip_clickhouse
    )
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main() 