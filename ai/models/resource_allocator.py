"""
Resource Allocation Optimizer using Proximal Policy Optimization (PPO)
Dynamically allocates bandwidth and computing resources across transfers
"""

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.distributions import Categorical, Normal
import gym
from gym import spaces
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime
import os
import json

logger = logging.getLogger(__name__)

class ResourceAllocationEnv(gym.Env):
    """
    Custom environment for resource allocation learning
    """
    
    def __init__(self, max_agents: int = 10, total_bandwidth_mbps: int = 1000):
        super(ResourceAllocationEnv, self).__init__()
        
        self.max_agents = max_agents
        self.total_bandwidth_mbps = total_bandwidth_mbps
        self.max_cpu_cores = 16
        self.max_memory_gb = 64
        
        # Observation space: [agent_count, total_demand, current_allocations, performance_metrics]
        obs_size = (
            1 +  # active_agent_count
            3 +  # total_demand (bandwidth, cpu, memory)
            max_agents * 3 +  # current allocations per agent
            max_agents * 2 +  # performance metrics per agent (throughput, success_rate)
            4    # system metrics (cpu_usage, memory_usage, network_congestion, time_of_day)
        )
        self.observation_space = spaces.Box(low=0, high=1, shape=(obs_size,), dtype=np.float32)
        
        # Action space: bandwidth allocation percentages for each agent
        self.action_space = spaces.Box(
            low=0.0, high=1.0, 
            shape=(max_agents,), 
            dtype=np.float32
        )
        
        # State
        self.agents = []
        self.current_step = 0
        self.max_steps = 100
        
    def reset(self):
        """Reset environment to initial state"""
        # Generate random agents
        num_agents = np.random.randint(1, self.max_agents + 1)
        self.agents = []
        
        for i in range(num_agents):
            agent = {
                'id': i,
                'priority': np.random.choice(['high', 'medium', 'low']),
                'bandwidth_demand': np.random.uniform(10, 200),  # Mbps
                'cpu_demand': np.random.uniform(0.5, 4.0),       # cores
                'memory_demand': np.random.uniform(1, 8),        # GB
                'file_size_gb': np.random.uniform(0.1, 100),
                'current_bandwidth': 0,
                'current_cpu': 0,
                'current_memory': 0,
                'throughput': 0,
                'success_rate': 1.0
            }
            self.agents.append(agent)
        
        self.current_step = 0
        return self._get_observation()
    
    def step(self, action):
        """Execute one step in the environment"""
        # Normalize action to sum to 1 (bandwidth allocation percentages)
        action = np.clip(action[:len(self.agents)], 0, 1)
        if np.sum(action) > 0:
            action = action / np.sum(action)
        
        # Allocate resources based on action
        total_reward = 0
        for i, agent in enumerate(self.agents):
            # Allocate bandwidth
            allocated_bandwidth = action[i] * self.total_bandwidth_mbps
            agent['current_bandwidth'] = allocated_bandwidth
            
            # Simple CPU and memory allocation based on bandwidth ratio
            bandwidth_ratio = allocated_bandwidth / agent['bandwidth_demand']
            agent['current_cpu'] = min(agent['cpu_demand'] * bandwidth_ratio, self.max_cpu_cores)
            agent['current_memory'] = min(agent['memory_demand'] * bandwidth_ratio, self.max_memory_gb)
            
            # Calculate performance metrics
            satisfaction_ratio = min(allocated_bandwidth / agent['bandwidth_demand'], 1.0)
            agent['throughput'] = allocated_bandwidth * satisfaction_ratio * 0.8  # Efficiency factor
            agent['success_rate'] = satisfaction_ratio
            
            # Calculate reward for this agent
            agent_reward = self._calculate_agent_reward(agent)
            total_reward += agent_reward
        
        # System-level penalties
        total_allocated_bandwidth = sum(agent['current_bandwidth'] for agent in self.agents)
        if total_allocated_bandwidth > self.total_bandwidth_mbps:
            total_reward -= 50  # Over-allocation penalty
        
        # Fairness penalty
        if len(self.agents) > 1:
            allocations = [agent['current_bandwidth'] for agent in self.agents]
            fairness_penalty = np.std(allocations) / np.mean(allocations) if np.mean(allocations) > 0 else 0
            total_reward -= fairness_penalty * 10
        
        self.current_step += 1
        done = self.current_step >= self.max_steps
        
        return self._get_observation(), total_reward, done, {}
    
    def _calculate_agent_reward(self, agent):
        """Calculate reward for individual agent"""
        reward = 0
        
        # Base reward for throughput
        reward += agent['throughput'] / 100  # Scale to reasonable range
        
        # Priority-based reward
        priority_multiplier = {'high': 2.0, 'medium': 1.0, 'low': 0.5}
        reward *= priority_multiplier[agent['priority']]
        
        # Success rate bonus
        reward += agent['success_rate'] * 10
        
        # Efficiency bonus (getting more than minimum required)
        if agent['current_bandwidth'] >= agent['bandwidth_demand']:
            reward += 5
        
        return reward
    
    def _get_observation(self):
        """Get current observation state"""
        obs = []
        
        # Active agent count (normalized)
        obs.append(len(self.agents) / self.max_agents)
        
        # Total demand
        total_bandwidth_demand = sum(agent['bandwidth_demand'] for agent in self.agents)
        total_cpu_demand = sum(agent['cpu_demand'] for agent in self.agents)
        total_memory_demand = sum(agent['memory_demand'] for agent in self.agents)
        
        obs.extend([
            total_bandwidth_demand / self.total_bandwidth_mbps,
            total_cpu_demand / self.max_cpu_cores,
            total_memory_demand / self.max_memory_gb
        ])
        
        # Current allocations and performance for each agent slot
        for i in range(self.max_agents):
            if i < len(self.agents):
                agent = self.agents[i]
                obs.extend([
                    agent['current_bandwidth'] / self.total_bandwidth_mbps,
                    agent['current_cpu'] / self.max_cpu_cores,
                    agent['current_memory'] / self.max_memory_gb,
                    agent['throughput'] / 200,  # Normalize throughput
                    agent['success_rate']
                ])
            else:
                obs.extend([0, 0, 0, 0, 0])  # Empty agent slot
        
        # System metrics (simulated)
        obs.extend([
            np.random.uniform(0.3, 0.8),  # cpu_usage
            np.random.uniform(0.4, 0.7),  # memory_usage
            np.random.uniform(0.2, 0.9),  # network_congestion
            (datetime.now().hour % 24) / 24  # time_of_day
        ])
        
        return np.array(obs, dtype=np.float32)

class PPOActor(nn.Module):
    """Actor network for PPO"""
    
    def __init__(self, state_size: int, action_size: int, hidden_size: int = 256):
        super(PPOActor, self).__init__()
        self.fc1 = nn.Linear(state_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, action_size)
        self.dropout = nn.Dropout(0.1)
        
    def forward(self, state):
        x = F.relu(self.fc1(state))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.dropout(x)
        x = torch.sigmoid(self.fc3(x))  # Output between 0 and 1
        return x

class PPOCritic(nn.Module):
    """Critic network for PPO"""
    
    def __init__(self, state_size: int, hidden_size: int = 256):
        super(PPOCritic, self).__init__()
        self.fc1 = nn.Linear(state_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.fc3 = nn.Linear(hidden_size, 1)
        self.dropout = nn.Dropout(0.1)
        
    def forward(self, state):
        x = F.relu(self.fc1(state))
        x = self.dropout(x)
        x = F.relu(self.fc2(x))
        x = self.fc3(x)
        return x

class ResourceAllocator:
    """
    PPO-based resource allocator for dynamic bandwidth and compute allocation
    """
    
    def __init__(self, max_agents: int = 10, model_dir: str = "models/resource"):
        self.max_agents = max_agents
        self.model_dir = model_dir
        
        # Environment
        self.env = ResourceAllocationEnv(max_agents=max_agents)
        self.state_size = self.env.observation_space.shape[0]
        self.action_size = self.env.action_space.shape[0]
        
        # Networks
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.actor = PPOActor(self.state_size, self.action_size).to(self.device)
        self.critic = PPOCritic(self.state_size).to(self.device)
        
        # Optimizers
        self.actor_optimizer = optim.Adam(self.actor.parameters(), lr=3e-4)
        self.critic_optimizer = optim.Adam(self.critic.parameters(), lr=3e-4)
        
        # PPO hyperparameters
        self.gamma = 0.99
        self.eps_clip = 0.2
        self.k_epochs = 4
        self.entropy_coef = 0.01
        
        # Model metadata
        self.model_metadata = {}
        
        # Create model directory
        os.makedirs(self.model_dir, exist_ok=True)
        
        logger.info(f"Initialized ResourceAllocator with {self.state_size} state features and {self.action_size} actions")
    
    def get_action(self, state: np.ndarray, deterministic: bool = False) -> Tuple[np.ndarray, float]:
        """Get action from policy"""
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            action_probs = self.actor(state_tensor)
            
            if deterministic:
                action = action_probs.cpu().numpy()[0]
                log_prob = 0.0
            else:
                # Add noise for exploration
                noise = torch.normal(0, 0.1, action_probs.shape).to(self.device)
                action_probs = torch.clamp(action_probs + noise, 0, 1)
                
                action = action_probs.cpu().numpy()[0]
                
                # Calculate log probability (simplified)
                log_prob = torch.sum(torch.log(action_probs + 1e-8)).item()
        
        return action, log_prob
    
    def allocate_resources(self, agents: List[Dict[str, Any]], 
                         system_metrics: Dict[str, float]) -> Dict[str, Any]:
        """
        Allocate resources optimally across agents
        """
        # Convert agent data to state format
        state = self._agents_to_state(agents, system_metrics)
        
        # Get allocation action
        action, confidence = self.get_action(state, deterministic=True)
        
        # Apply allocation
        total_bandwidth = system_metrics.get('total_bandwidth_mbps', 1000)
        allocations = []
        
        for i, agent in enumerate(agents):
            if i < len(action):
                bandwidth_allocation = action[i] * total_bandwidth
                cpu_ratio = min(bandwidth_allocation / agent.get('bandwidth_demand', 100), 1.0)
                
                allocation = {
                    'agent_id': agent.get('id', i),
                    'bandwidth_mbps': bandwidth_allocation,
                    'cpu_cores': agent.get('cpu_demand', 2) * cpu_ratio,
                    'memory_gb': agent.get('memory_demand', 4) * cpu_ratio,
                    'priority_weight': self._get_priority_weight(agent.get('priority', 'medium')),
                    'expected_throughput': bandwidth_allocation * 0.8  # Efficiency factor
                }
                allocations.append(allocation)
        
        return {
            'allocations': allocations,
            'total_bandwidth_allocated': sum(a['bandwidth_mbps'] for a in allocations),
            'total_cpu_allocated': sum(a['cpu_cores'] for a in allocations),
            'total_memory_allocated': sum(a['memory_gb'] for a in allocations),
            'confidence': abs(confidence),
            'fairness_score': self._calculate_fairness_score(allocations),
            'efficiency_score': self._calculate_efficiency_score(allocations, total_bandwidth)
        }
    
    def _agents_to_state(self, agents: List[Dict[str, Any]], 
                        system_metrics: Dict[str, float]) -> np.ndarray:
        """Convert agent list to state vector"""
        state = []
        
        # Active agent count
        state.append(len(agents) / self.max_agents)
        
        # Total demands
        total_bandwidth_demand = sum(agent.get('bandwidth_demand', 100) for agent in agents)
        total_cpu_demand = sum(agent.get('cpu_demand', 2) for agent in agents)
        total_memory_demand = sum(agent.get('memory_demand', 4) for agent in agents)
        
        state.extend([
            total_bandwidth_demand / 1000,  # Normalize
            total_cpu_demand / 16,
            total_memory_demand / 64
        ])
        
        # Individual agent data
        for i in range(self.max_agents):
            if i < len(agents):
                agent = agents[i]
                state.extend([
                    agent.get('current_bandwidth', 0) / 1000,
                    agent.get('current_cpu', 0) / 16,
                    agent.get('current_memory', 0) / 64,
                    agent.get('throughput', 0) / 200,
                    agent.get('success_rate', 1.0)
                ])
            else:
                state.extend([0, 0, 0, 0, 0])
        
        # System metrics
        state.extend([
            system_metrics.get('cpu_usage', 50) / 100,
            system_metrics.get('memory_usage', 60) / 100,
            system_metrics.get('network_congestion', 50) / 100,
            (datetime.now().hour % 24) / 24
        ])
        
        return np.array(state, dtype=np.float32)
    
    def _get_priority_weight(self, priority: str) -> float:
        """Get priority weight for allocation"""
        weights = {'high': 2.0, 'medium': 1.0, 'low': 0.5}
        return weights.get(priority, 1.0)
    
    def _calculate_fairness_score(self, allocations: List[Dict[str, Any]]) -> float:
        """Calculate fairness score (lower is more fair)"""
        if len(allocations) <= 1:
            return 1.0
        
        bandwidths = [a['bandwidth_mbps'] for a in allocations]
        mean_bw = np.mean(bandwidths)
        if mean_bw == 0:
            return 1.0
        
        # Coefficient of variation (lower is more fair)
        cv = np.std(bandwidths) / mean_bw
        return max(0, 1 - cv)  # Convert to score (higher is better)
    
    def _calculate_efficiency_score(self, allocations: List[Dict[str, Any]], 
                                  total_bandwidth: float) -> float:
        """Calculate resource utilization efficiency"""
        total_allocated = sum(a['bandwidth_mbps'] for a in allocations)
        utilization = total_allocated / total_bandwidth if total_bandwidth > 0 else 0
        
        # Optimal utilization is around 80-90%
        if 0.8 <= utilization <= 0.9:
            return 1.0
        elif utilization < 0.8:
            return utilization / 0.8
        else:
            return max(0, 1 - (utilization - 0.9) / 0.1)
    
    def train(self, episodes: int = 1000) -> Dict[str, Any]:
        """Train the resource allocator"""
        logger.info(f"Training resource allocator for {episodes} episodes...")
        
        episode_rewards = []
        
        for episode in range(episodes):
            state = self.env.reset()
            episode_reward = 0
            states, actions, rewards, log_probs = [], [], [], []
            
            for step in range(100):  # Max steps per episode
                action, log_prob = self.get_action(state)
                next_state, reward, done, _ = self.env.step(action)
                
                states.append(state)
                actions.append(action)
                rewards.append(reward)
                log_probs.append(log_prob)
                
                episode_reward += reward
                state = next_state
                
                if done:
                    break
            
            # Update policy
            if len(states) > 0:
                self._update_policy(states, actions, rewards, log_probs)
            
            episode_rewards.append(episode_reward)
            
            if episode % 100 == 0:
                avg_reward = np.mean(episode_rewards[-100:])
                logger.info(f"Episode {episode}, Average Reward: {avg_reward:.2f}")
        
        # Store training metadata
        self.model_metadata = {
            'trained_at': datetime.now().isoformat(),
            'training_episodes': episodes,
            'final_avg_reward': np.mean(episode_rewards[-100:]),
            'max_agents': self.max_agents,
            'state_size': self.state_size,
            'action_size': self.action_size
        }
        
        logger.info("Resource allocator training completed")
        return self.model_metadata
    
    def _update_policy(self, states, actions, rewards, log_probs):
        """Update PPO policy"""
        # Convert to tensors
        states = torch.FloatTensor(np.array(states)).to(self.device)
        actions = torch.FloatTensor(np.array(actions)).to(self.device)
        old_log_probs = torch.FloatTensor(log_probs).to(self.device)
        
        # Calculate discounted rewards
        discounted_rewards = []
        discounted_reward = 0
        for reward in reversed(rewards):
            discounted_reward = reward + self.gamma * discounted_reward
            discounted_rewards.insert(0, discounted_reward)
        
        discounted_rewards = torch.FloatTensor(discounted_rewards).to(self.device)
        discounted_rewards = (discounted_rewards - discounted_rewards.mean()) / (discounted_rewards.std() + 1e-8)
        
        # PPO update
        for _ in range(self.k_epochs):
            # Actor loss
            action_probs = self.actor(states)
            new_log_probs = torch.sum(torch.log(action_probs + 1e-8), dim=1)
            
            ratio = torch.exp(new_log_probs - old_log_probs)
            surr1 = ratio * discounted_rewards
            surr2 = torch.clamp(ratio, 1 - self.eps_clip, 1 + self.eps_clip) * discounted_rewards
            actor_loss = -torch.min(surr1, surr2).mean()
            
            # Critic loss
            state_values = self.critic(states).squeeze()
            critic_loss = F.mse_loss(state_values, discounted_rewards)
            
            # Update networks
            self.actor_optimizer.zero_grad()
            actor_loss.backward()
            self.actor_optimizer.step()
            
            self.critic_optimizer.zero_grad()
            critic_loss.backward()
            self.critic_optimizer.step()
    
    def save_model(self, version: str = None) -> str:
        """Save trained model"""
        if version is None:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        version_dir = os.path.join(self.model_dir, version)
        os.makedirs(version_dir, exist_ok=True)
        
        # Save models
        torch.save(self.actor.state_dict(), os.path.join(version_dir, 'actor.pth'))
        torch.save(self.critic.state_dict(), os.path.join(version_dir, 'critic.pth'))
        
        # Save metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'w') as f:
            json.dump(self.model_metadata, f, indent=2)
        
        logger.info(f"Resource allocator saved to {version_dir}")
        return version_dir
    
    def load_model(self, version: str) -> None:
        """Load trained model"""
        version_dir = os.path.join(self.model_dir, version)
        
        if not os.path.exists(version_dir):
            raise ValueError(f"Model version {version} not found")
        
        # Load models
        self.actor.load_state_dict(torch.load(os.path.join(version_dir, 'actor.pth'), map_location=self.device))
        self.critic.load_state_dict(torch.load(os.path.join(version_dir, 'critic.pth'), map_location=self.device))
        
        # Load metadata
        with open(os.path.join(version_dir, 'metadata.json'), 'r') as f:
            self.model_metadata = json.load(f)
        
        logger.info(f"Resource allocator loaded from {version_dir}")

if __name__ == "__main__":
    # Example usage
    allocator = ResourceAllocator(max_agents=5)
    
    # Train the model
    training_results = allocator.train(episodes=200)
    print("Training Results:", training_results)
    
    # Test allocation
    test_agents = [
        {'id': 1, 'priority': 'high', 'bandwidth_demand': 150, 'cpu_demand': 3, 'memory_demand': 6},
        {'id': 2, 'priority': 'medium', 'bandwidth_demand': 100, 'cpu_demand': 2, 'memory_demand': 4},
        {'id': 3, 'priority': 'low', 'bandwidth_demand': 50, 'cpu_demand': 1, 'memory_demand': 2}
    ]
    
    system_metrics = {
        'total_bandwidth_mbps': 1000,
        'cpu_usage': 60,
        'memory_usage': 70,
        'network_congestion': 40
    }
    
    allocation_result = allocator.allocate_resources(test_agents, system_metrics)
    
    print("\nResource Allocation Result:")
    for allocation in allocation_result['allocations']:
        print(f"  Agent {allocation['agent_id']}: {allocation['bandwidth_mbps']:.1f} Mbps, "
              f"{allocation['cpu_cores']:.1f} cores, {allocation['memory_gb']:.1f} GB")
    
    print(f"Total allocated: {allocation_result['total_bandwidth_allocated']:.1f} Mbps")
    print(f"Fairness score: {allocation_result['fairness_score']:.2f}")
    print(f"Efficiency score: {allocation_result['efficiency_score']:.2f}") 