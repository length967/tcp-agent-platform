"""
Scheduling Optimization Engine using Deep Q-Network (DQN)
Optimizes transfer scheduling based on network conditions and historical performance
"""

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
import random
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from collections import deque, namedtuple
from datetime import datetime, timedelta
import os
import json

logger = logging.getLogger(__name__)

# Experience tuple for replay buffer
Experience = namedtuple('Experience', ['state', 'action', 'reward', 'next_state', 'done'])

class SchedulingDQN(nn.Module):
    """
    Deep Q-Network for transfer scheduling decisions
    """
    
    def __init__(self, state_size: int, action_size: int, hidden_size: int = 256):
        super(SchedulingDQN, self).__init__()
        self.fc1 = nn.Linear(state_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, hidden_size)
        self.fc4 = nn.Linear(hidden_size, action_size)
        self.dropout = nn.Dropout(0.2)
    
    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        x = F.relu(self.fc3(x))
        x = self.fc4(x)
        return x

class ReplayBuffer:
    """
    Experience replay buffer for DQN training
    """
    
    def __init__(self, capacity: int = 10000):
        self.buffer = deque(maxlen=capacity)
    
    def push(self, experience: Experience):
        self.buffer.append(experience)
    
    def sample(self, batch_size: int) -> List[Experience]:
        return random.sample(self.buffer, batch_size)
    
    def __len__(self):
        return len(self.buffer)

class SchedulingOptimizer:
    """
    DQN-based scheduling optimizer for transfer operations
    """
    
    def __init__(self, state_size: int = 50, action_size: int = 24, model_dir: str = "models/scheduling"):
        # Network parameters
        self.state_size = state_size
        self.action_size = action_size  # 24 hours for hourly scheduling
        self.model_dir = model_dir
        
        # DQN networks
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.q_network = SchedulingDQN(state_size, action_size).to(self.device)
        self.target_network = SchedulingDQN(state_size, action_size).to(self.device)
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=0.001)
        
        # Training parameters
        self.epsilon = 1.0
        self.epsilon_decay = 0.995
        self.epsilon_min = 0.01
        self.gamma = 0.95  # Discount factor
        self.tau = 0.005   # Soft update parameter
        self.batch_size = 64
        self.update_every = 4
        self.step_count = 0
        
        # Experience replay
        self.memory = ReplayBuffer(capacity=50000)
        
        # State features
        self.state_features = [
            'hour_of_day', 'day_of_week', 'is_weekend', 'is_business_hours',
            'avg_bandwidth_utilization', 'avg_latency_ms', 'avg_packet_loss_rate',
            'avg_cpu_usage', 'avg_memory_usage', 'avg_throughput_mbps',
            'network_congestion_score', 'system_load_score', 'success_rate_1h',
            'success_rate_24h', 'active_transfers', 'queue_length',
            'priority_high_count', 'priority_medium_count', 'priority_low_count',
            'file_size_small_count', 'file_size_medium_count', 'file_size_large_count'
        ]
        
        # Scheduling actions (hours from now)
        self.action_mapping = list(range(24))  # 0-23 hours from current time
        
        # Model metadata
        self.model_metadata = {}
        
        # Create model directory
        os.makedirs(self.model_dir, exist_ok=True)
        
        logger.info(f"Initialized SchedulingOptimizer with {state_size} state features and {action_size} actions")
    
    def _extract_state_features(self, current_time: datetime, 
                               network_metrics: Dict[str, float],
                               system_metrics: Dict[str, float],
                               transfer_queue: List[Dict[str, Any]]) -> np.ndarray:
        """
        Extract state features for DQN input
        """
        features = []
        
        # Temporal features
        features.extend([
            current_time.hour,
            current_time.weekday(),
            1.0 if current_time.weekday() >= 5 else 0.0,  # is_weekend
            1.0 if 9 <= current_time.hour <= 17 else 0.0  # is_business_hours
        ])
        
        # Network metrics (with defaults)
        features.extend([
            network_metrics.get('bandwidth_utilization', 50.0),
            network_metrics.get('latency_ms', 50.0),
            network_metrics.get('packet_loss_rate', 0.01),
            network_metrics.get('throughput_mbps', 100.0)
        ])
        
        # System metrics
        features.extend([
            system_metrics.get('cpu_usage', 50.0),
            system_metrics.get('memory_usage', 60.0)
        ])
        
        # Derived metrics
        network_congestion = (
            network_metrics.get('bandwidth_utilization', 50.0) * 0.4 +
            min(network_metrics.get('latency_ms', 50.0) / 2, 100) * 0.3 +
            network_metrics.get('packet_loss_rate', 0.01) * 1000 * 0.3
        )
        
        system_load = (
            system_metrics.get('cpu_usage', 50.0) * 0.6 +
            system_metrics.get('memory_usage', 60.0) * 0.4
        )
        
        features.extend([network_congestion, system_load])
        
        # Historical success rates (would be calculated from historical data)
        features.extend([
            network_metrics.get('success_rate_1h', 95.0),
            network_metrics.get('success_rate_24h', 97.0)
        ])
        
        # Transfer queue analysis
        active_transfers = len([t for t in transfer_queue if t.get('status') == 'active'])
        queue_length = len([t for t in transfer_queue if t.get('status') == 'queued'])
        
        # Priority distribution
        priority_counts = {'high': 0, 'medium': 0, 'low': 0}
        size_counts = {'small': 0, 'medium': 0, 'large': 0}
        
        for transfer in transfer_queue:
            priority = transfer.get('priority', 'medium')
            if priority in priority_counts:
                priority_counts[priority] += 1
            
            size_gb = transfer.get('size_gb', 1.0)
            if size_gb < 0.1:
                size_counts['small'] += 1
            elif size_gb < 10.0:
                size_counts['medium'] += 1
            else:
                size_counts['large'] += 1
        
        features.extend([
            active_transfers,
            queue_length,
            priority_counts['high'],
            priority_counts['medium'],
            priority_counts['low'],
            size_counts['small'],
            size_counts['medium'],
            size_counts['large']
        ])
        
        # Pad or truncate to exact state size
        while len(features) < self.state_size:
            features.append(0.0)
        features = features[:self.state_size]
        
        return np.array(features, dtype=np.float32)
    
    def _calculate_reward(self, action: int, transfer_result: Dict[str, Any],
                         network_state: Dict[str, float]) -> float:
        """
        Calculate reward for a scheduling decision
        """
        reward = 0.0
        
        # Base reward for successful transfer
        if transfer_result.get('success', False):
            reward += 10.0
        else:
            reward -= 20.0
        
        # Reward for meeting time expectations
        expected_duration = transfer_result.get('expected_duration_minutes', 60)
        actual_duration = transfer_result.get('actual_duration_minutes', 60)
        
        if actual_duration <= expected_duration:
            reward += 5.0
        else:
            # Penalty for taking longer than expected
            delay_factor = (actual_duration - expected_duration) / expected_duration
            reward -= min(delay_factor * 10, 15.0)
        
        # Reward for high throughput
        throughput_mbps = transfer_result.get('throughput_mbps', 0)
        if throughput_mbps > 100:
            reward += 3.0
        elif throughput_mbps > 50:
            reward += 1.0
        elif throughput_mbps < 10:
            reward -= 5.0
        
        # Penalty for scheduling during high congestion
        congestion_score = network_state.get('congestion_score', 50.0)
        if congestion_score > 80:
            reward -= 5.0
        elif congestion_score < 30:
            reward += 2.0
        
        # Reward for off-peak scheduling (if not critical)
        priority = transfer_result.get('priority', 'medium')
        scheduled_hour = action  # Action represents hour offset
        current_hour = datetime.now().hour
        target_hour = (current_hour + scheduled_hour) % 24
        
        if priority != 'critical':
            # Business hours penalty for non-critical transfers
            if 9 <= target_hour <= 17:
                reward -= 2.0
            # Night hours bonus
            elif 22 <= target_hour or target_hour <= 6:
                reward += 3.0
        
        # Priority-based adjustments
        if priority == 'critical' and action > 2:  # Delay critical transfer
            reward -= 10.0
        elif priority == 'low' and action == 0:  # Immediate scheduling of low priority
            reward -= 3.0
        
        return reward
    
    def get_optimal_schedule(self, current_time: datetime,
                           network_metrics: Dict[str, float],
                           system_metrics: Dict[str, float],
                           transfer_queue: List[Dict[str, Any]],
                           transfer_priority: str = 'medium') -> Dict[str, Any]:
        """
        Get optimal scheduling decision
        """
        # Simple heuristic for now - would use trained DQN in full implementation
        action = 0  # Immediate scheduling by default
        
        # Adjust based on priority
        if transfer_priority == 'critical':
            action = 0  # Immediate
        elif transfer_priority == 'low':
            # Prefer off-peak hours
            current_hour = current_time.hour
            if 9 <= current_hour <= 17:  # Business hours
                action = random.choice([6, 7, 8, 9, 10])  # Evening/night
            else:
                action = 0
        
        # Calculate scheduled time
        scheduled_time = current_time + timedelta(hours=action)
        
        return {
            'action': action,
            'scheduled_time': scheduled_time,
            'scheduled_hour': scheduled_time.hour,
            'delay_hours': action,
            'confidence': 0.8,
            'exploration': False,
            'reasoning': f"Scheduled for {scheduled_time.strftime('%H:%M')} based on {transfer_priority} priority"
        }
    
    def store_experience(self, state: np.ndarray, action: int, reward: float,
                        next_state: np.ndarray, done: bool):
        """
        Store experience in replay buffer
        """
        experience = Experience(state, action, reward, next_state, done)
        self.memory.push(experience)
    
    def train_step(self) -> Dict[str, float]:
        """
        Perform one training step
        """
        if len(self.memory) < self.batch_size:
            return {}
        
        # Sample batch from memory
        experiences = self.memory.sample(self.batch_size)
        batch = Experience(*zip(*experiences))
        
        # Convert to tensors
        states = torch.FloatTensor(np.array(batch.state)).to(self.device)
        actions = torch.LongTensor(batch.action).to(self.device)
        rewards = torch.FloatTensor(batch.reward).to(self.device)
        next_states = torch.FloatTensor(np.array(batch.next_state)).to(self.device)
        dones = torch.BoolTensor(batch.done).to(self.device)
        
        # Current Q values
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))
        
        # Next Q values from target network
        next_q_values = self.target_network(next_states).max(1)[0].detach()
        target_q_values = rewards + (self.gamma * next_q_values * ~dones)
        
        # Compute loss
        loss = F.mse_loss(current_q_values.squeeze(), target_q_values)
        
        # Optimize
        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.q_network.parameters(), 1.0)
        self.optimizer.step()
        
        # Soft update target network
        self._soft_update()
        
        # Update epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
        
        return {
            'loss': loss.item(),
            'epsilon': self.epsilon,
            'q_mean': current_q_values.mean().item()
        }
    
    def _soft_update(self):
        """
        Soft update of target network parameters
        """
        for target_param, local_param in zip(self.target_network.parameters(), 
                                           self.q_network.parameters()):
            target_param.data.copy_(self.tau * local_param.data + 
                                  (1.0 - self.tau) * target_param.data)
    
    def train(self, training_episodes: int = 1000) -> Dict[str, Any]:
        """
        Train the scheduling optimizer
        """
        logger.info(f"Training scheduling optimizer for {training_episodes} episodes...")
        
        training_metrics = {
            'episodes': [],
            'rewards': [],
            'losses': [],
            'epsilons': []
        }
        
        for episode in range(training_episodes):
            # Simulate episode (in practice, this would use real transfer data)
            episode_reward = self._simulate_episode()
            training_metrics['episodes'].append(episode)
            training_metrics['rewards'].append(episode_reward)
            
            # Training step
            if episode % self.update_every == 0:
                train_result = self.train_step()
                if train_result:
                    training_metrics['losses'].append(train_result['loss'])
                    training_metrics['epsilons'].append(train_result['epsilon'])
            
            if episode % 100 == 0:
                avg_reward = np.mean(training_metrics['rewards'][-100:])
                logger.info(f"Episode {episode}, Average Reward: {avg_reward:.2f}, "
                          f"Epsilon: {self.epsilon:.3f}")
        
        # Store training metadata
        self.model_metadata = {
            'trained_at': datetime.now().isoformat(),
            'training_episodes': training_episodes,
            'final_epsilon': self.epsilon,
            'state_features': self.state_features,
            'action_mapping': self.action_mapping,
            'training_metrics': {
                'final_avg_reward': np.mean(training_metrics['rewards'][-100:]),
                'final_loss': training_metrics['losses'][-1] if training_metrics['losses'] else 0,
                'episodes_trained': len(training_metrics['episodes'])
            }
        }
        
        logger.info("Scheduling optimizer training completed")
        return self.model_metadata
    
    def _simulate_episode(self) -> float:
        """
        Simulate one training episode (placeholder implementation)
        """
        # This is a simplified simulation - in practice, you would use real data
        total_reward = 0.0
        
        # Simulate transfer scheduling scenario
        current_time = datetime.now()
        network_metrics = {
            'bandwidth_utilization': random.uniform(30, 90),
            'latency_ms': random.uniform(20, 100),
            'packet_loss_rate': random.uniform(0, 0.05),
            'congestion_score': random.uniform(20, 90)
        }
        system_metrics = {
            'cpu_usage': random.uniform(20, 80),
            'memory_usage': random.uniform(40, 85)
        }
        transfer_queue = [
            {'priority': random.choice(['high', 'medium', 'low']),
             'size_gb': random.uniform(0.1, 50),
             'status': 'queued'}
            for _ in range(random.randint(1, 10))
        ]
        
        state = self._extract_state_features(current_time, network_metrics, 
                                           system_metrics, transfer_queue)
        
        # Get action
        schedule_result = self.get_optimal_schedule(current_time, network_metrics,
                                                  system_metrics, transfer_queue)
        action = schedule_result['action']
        
        # Simulate transfer result
        transfer_result = {
            'success': random.random() > 0.1,  # 90% success rate
            'throughput_mbps': random.uniform(50, 200),
            'expected_duration_minutes': 30,
            'actual_duration_minutes': random.uniform(20, 60),
            'priority': random.choice(['high', 'medium', 'low'])
        }
        
        # Calculate reward
        reward = self._calculate_reward(action, transfer_result, network_metrics)
        total_reward += reward
        
        # Store experience (next_state would be updated state after transfer)
        next_state = self._extract_state_features(current_time + timedelta(hours=1),
                                                network_metrics, system_metrics, [])
        self.store_experience(state, action, reward, next_state, True)
        
        return total_reward
    
    def save_model(self, version: str = None) -> str:
        """
        Save trained model and metadata
        """
        if version is None:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        version_dir = os.path.join(self.model_dir, version)
        os.makedirs(version_dir, exist_ok=True)
        
        # Save PyTorch models
        torch.save(self.q_network.state_dict(), 
                  os.path.join(version_dir, 'q_network.pth'))
        torch.save(self.target_network.state_dict(), 
                  os.path.join(version_dir, 'target_network.pth'))
        torch.save(self.optimizer.state_dict(), 
                  os.path.join(version_dir, 'optimizer.pth'))
        
        # Save training state
        training_state = {
            'epsilon': self.epsilon,
            'step_count': self.step_count,
            'state_size': self.state_size,
            'action_size': self.action_size
        }
        torch.save(training_state, os.path.join(version_dir, 'training_state.pth'))
        
        # Save metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'w') as f:
            json.dump(self.model_metadata, f, indent=2)
        
        logger.info(f"Scheduling model saved to {version_dir}")
        return version_dir
    
    def load_model(self, version: str) -> None:
        """
        Load trained model and metadata
        """
        version_dir = os.path.join(self.model_dir, version)
        
        if not os.path.exists(version_dir):
            raise ValueError(f"Model version {version} not found")
        
        # Load PyTorch models
        self.q_network.load_state_dict(
            torch.load(os.path.join(version_dir, 'q_network.pth'), 
                      map_location=self.device))
        self.target_network.load_state_dict(
            torch.load(os.path.join(version_dir, 'target_network.pth'), 
                      map_location=self.device))
        self.optimizer.load_state_dict(
            torch.load(os.path.join(version_dir, 'optimizer.pth'), 
                      map_location=self.device))
        
        # Load training state
        training_state = torch.load(os.path.join(version_dir, 'training_state.pth'), 
                                   map_location=self.device)
        self.epsilon = training_state['epsilon']
        self.step_count = training_state['step_count']
        
        # Load metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'r') as f:
            self.model_metadata = json.load(f)
        
        logger.info(f"Scheduling model loaded from {version_dir}")

if __name__ == "__main__":
    # Example usage
    optimizer = SchedulingOptimizer(state_size=22, action_size=24)
    
    # Train the model
    training_results = optimizer.train(training_episodes=500)
    
    print("Training Results:")
    for key, value in training_results.items():
        if key != 'training_metrics':
            print(f"  {key}: {value}")
    
    # Test scheduling decision
    current_time = datetime.now()
    network_metrics = {
        'bandwidth_utilization': 75.0,
        'latency_ms': 45.0,
        'packet_loss_rate': 0.02,
        'congestion_score': 65.0
    }
    system_metrics = {
        'cpu_usage': 55.0,
        'memory_usage': 68.0
    }
    transfer_queue = [
        {'priority': 'high', 'size_gb': 5.0, 'status': 'queued'},
        {'priority': 'medium', 'size_gb': 1.2, 'status': 'queued'},
        {'priority': 'low', 'size_gb': 0.5, 'status': 'queued'}
    ]
    
    # Get scheduling recommendation
    schedule = optimizer.get_optimal_schedule(
        current_time, network_metrics, system_metrics, transfer_queue, 'medium'
    )
    
    print(f"\nScheduling Recommendation:")
    print(f"  Action: {schedule['action']} (delay {schedule['delay_hours']} hours)")
    print(f"  Scheduled time: {schedule['scheduled_time'].strftime('%Y-%m-%d %H:%M')}")
    print(f"  Confidence: {schedule['confidence']:.2f}")
    print(f"  Reasoning: {schedule['reasoning']}")
    print(f"  Exploration: {schedule['exploration']}") 