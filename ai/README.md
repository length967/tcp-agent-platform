# TCP Agent AI Platform

This directory contains the complete AI/ML implementation for the TCP Agent platform, including machine learning models, ClickHouse integration, and training pipelines for transfer optimization.

## 🏗️ Directory Structure

```
ai/
├── README.md                    # This file
├── requirements.txt             # Python dependencies
├── config.json                  # Configuration file (auto-generated)
├── clickhouse_client.py         # ClickHouse integration client
├── train_with_clickhouse.py     # End-to-end training pipeline
│
├── docs/                        # Documentation
│   ├── AI_IMPLEMENTATION_STATUS.md     # Current implementation status
│   ├── CLICKHOUSE_SETUP.md             # ClickHouse setup guide
│   └── CLICKHOUSE_INTEGRATION_PLAN.md  # Integration plan
│
├── docker/                      # Docker configurations
│   └── docker-compose.clickhouse.yml   # ClickHouse Docker setup
│
├── scripts/                     # Setup and utility scripts
│   ├── setup_clickhouse.sh      # ClickHouse setup script
│   └── setup_environment.py     # Python environment setup
│
├── features/                    # Feature engineering
│   └── engineering.py           # Feature extraction pipeline
│
├── models/                      # ML models
│   ├── performance_predictor.py # XGBoost performance prediction
│   ├── anomaly_detector.py      # LSTM anomaly detection
│   ├── resource_allocator.py    # PPO resource allocation
│   └── scheduling_optimizer.py  # DQN scheduling optimization
│
├── data/                        # Data directories (auto-created)
│   ├── cache/                   # Cached data
│   └── temp/                    # Temporary files
│
└── logs/                        # Log files (auto-created)
    └── ai_platform.log          # Main log file
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Set up Python environment and dependencies
cd ai/
python3 scripts/setup_environment.py

# Or manually:
pip install -r requirements.txt
```

### 2. ClickHouse Setup

```bash
# Start ClickHouse using Docker
./scripts/setup_clickhouse.sh

# Or manually:
cd docker/
docker-compose -f docker-compose.clickhouse.yml up -d
```

### 3. Run Training Pipeline

```bash
# Run complete training pipeline
python3 train_with_clickhouse.py
```

## 🔧 Configuration

The `config.json` file contains all configuration settings:

```json
{
  "clickhouse": {
    "host": "localhost",
    "port": 8123,
    "database": "tcp_optimization"
  },
  "models": {
    "performance_predictor": {
      "model_dir": "models/performance",
      "retrain_interval_hours": 24
    }
  }
}
```

## 📊 Models

### 1. Performance Predictor
- **Type**: XGBoost Regressor
- **Purpose**: Predict transfer throughput and completion time
- **Features**: Network metrics, system metrics, transfer settings
- **Output**: Predicted throughput (Mbps), completion time (minutes)

### 2. Anomaly Detector
- **Type**: Hybrid (Isolation Forest + LSTM Autoencoder)
- **Purpose**: Detect abnormal transfer performance
- **Features**: Time series of network and system metrics
- **Output**: Anomaly score, anomaly type classification

### 3. Resource Allocator
- **Type**: PPO (Proximal Policy Optimization)
- **Purpose**: Optimize bandwidth and compute resource allocation
- **Features**: Agent demands, system capacity, priorities
- **Output**: Resource allocation per agent

### 4. Scheduling Optimizer
- **Type**: DQN (Deep Q-Network)
- **Purpose**: Optimize transfer scheduling based on network conditions
- **Features**: Network conditions, queue state, historical performance
- **Output**: Optimal scheduling decisions

## 🗄️ ClickHouse Integration

### Database Schema

**tcp_telemetry** table stores all transfer telemetry:
- Network metrics (bandwidth, latency, packet loss)
- Transfer metrics (throughput, duration, chunk size)
- System metrics (CPU, memory, disk I/O)
- Environmental data (time, day of week)
- Optimization results

**ml_model_performance** table tracks model performance:
- Model metrics (accuracy, MAE, RMSE, R²)
- Training statistics
- Inference performance

### Data Pipeline

1. **Collection**: TCP agents send telemetry to ClickHouse
2. **Processing**: Feature engineering pipeline extracts ML features
3. **Training**: Models train on historical data
4. **Inference**: Real-time predictions for optimization
5. **Feedback**: Results stored back to ClickHouse

## 🧪 Testing

### Run Basic Tests
```bash
# Test environment setup
python3 scripts/setup_environment.py --test

# Test ClickHouse connectivity
./scripts/setup_clickhouse.sh test

# Test training pipeline with sample data
python3 train_with_clickhouse.py --sample-data
```

### Validate Models
```bash
# Check model performance
python3 -c "
from models.performance_predictor import TransferPerformancePredictor
predictor = TransferPerformancePredictor()
predictor.load_model('latest')
print('Model loaded successfully')
"
```

## 📈 Monitoring

### ClickHouse Web UI
- URL: http://localhost:8123/play
- Query telemetry data directly
- Monitor system performance

### Logs
```bash
# View AI platform logs
tail -f logs/ai_platform.log

# View ClickHouse logs
docker-compose -f docker/docker-compose.clickhouse.yml logs -f
```

## 🔄 Training Pipeline

The complete training pipeline (`train_with_clickhouse.py`) includes:

1. **Data Loading**: Fetch telemetry from ClickHouse
2. **Feature Engineering**: Extract and transform features
3. **Model Training**: Train all ML models
4. **Validation**: Cross-validation and performance metrics
5. **Model Saving**: Persist trained models
6. **Performance Tracking**: Record metrics in ClickHouse

## 🛠️ Development

### Adding New Models

1. Create model class in `models/` directory
2. Implement training and prediction methods
3. Add to training pipeline
4. Update configuration
5. Add tests

### Feature Engineering

1. Add feature extraction methods to `features/engineering.py`
2. Update feature validation
3. Test with sample data
4. Document new features

### ClickHouse Schema Changes

1. Update schema in `clickhouse_client.py`
2. Create migration script
3. Update training pipeline
4. Test with existing data

## 🚨 Troubleshooting

### Common Issues

**ClickHouse Connection Failed**
```bash
# Check if ClickHouse is running
docker ps | grep clickhouse

# Restart ClickHouse
./scripts/setup_clickhouse.sh restart
```

**Import Errors**
```bash
# Reinstall dependencies
python3 scripts/setup_environment.py --force-reinstall
```

**Training Failures**
```bash
# Check data availability
python3 -c "
import asyncio
from clickhouse_client import create_clickhouse_client
async def check():
    client = await create_clickhouse_client()
    df = await client.get_training_data(hours=24)
    print(f'Available records: {len(df)}')
asyncio.run(check())
"
```

### Performance Optimization

**ClickHouse Performance**
- Increase memory allocation in Docker Compose
- Optimize table partitioning
- Use materialized views for frequent queries

**Model Training**
- Use GPU acceleration (CUDA)
- Implement data sampling for large datasets
- Use early stopping to prevent overfitting

## 📚 Documentation

- [AI Implementation Status](docs/AI_IMPLEMENTATION_STATUS.md) - Current progress and next steps
- [ClickHouse Setup Guide](docs/CLICKHOUSE_SETUP.md) - Detailed setup instructions
- [ClickHouse Integration Plan](docs/CLICKHOUSE_INTEGRATION_PLAN.md) - Architecture and design decisions

## 🤝 Contributing

1. Follow the existing code structure
2. Add comprehensive tests
3. Update documentation
4. Use type hints and docstrings
5. Test with sample data before committing

## 📄 License

This AI platform is part of the TCP Agent project. See the main project README for license information. 