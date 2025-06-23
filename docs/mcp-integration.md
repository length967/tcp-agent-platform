# MCP Integration Guide

## Overview

The TCP Agent Platform provides comprehensive MCP (Model Context Protocol) integration, allowing AI agents to control and orchestrate file transfers programmatically. This enables natural language automation and intelligent workflow management.

## What is MCP?

Model Context Protocol is Anthropic's open standard for connecting AI assistants to data sources and tools. It provides a standardized way for AI models like Claude to interact with external systems.

## Architecture

```
┌─────────────┐      MCP Protocol       ┌──────────────┐      HTTPS/API      ┌─────────────┐
│  AI Agent   │ ◄─────────────────────► │  MCP Server  │ ◄─────────────────► │ TCP Agent   │
│  (Claude)   │                          │              │                      │  Platform   │
└─────────────┘                          └──────────────┘                      └─────────────┘
```

## MCP Server Implementation

### Available Tools

```typescript
// MCP tools exposed to AI agents
const tools = {
  // Agent Management
  listAgents: {
    description: "List all TCP agents in the project",
    parameters: {
      status: { type: "string", enum: ["online", "offline", "all"] },
      project_id: { type: "string", optional: true }
    }
  },
  
  getAgentDetails: {
    description: "Get detailed information about a specific agent",
    parameters: {
      agent_id: { type: "string", required: true }
    }
  },
  
  // Transfer Operations
  createTransfer: {
    description: "Initiate a file transfer between agents",
    parameters: {
      source_agent: { type: "string", required: true },
      source_path: { type: "string", required: true },
      destination_agent: { type: "string", required: true },
      destination_path: { type: "string", required: true },
      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
      options: {
        type: "object",
        properties: {
          compress: { type: "boolean" },
          encrypt: { type: "boolean" },
          verify_checksum: { type: "boolean" },
          bandwidth_limit: { type: "number" }
        }
      }
    }
  },
  
  getTransferStatus: {
    description: "Get real-time status of a transfer",
    parameters: {
      transfer_id: { type: "string", required: true }
    }
  },
  
  cancelTransfer: {
    description: "Cancel an active transfer",
    parameters: {
      transfer_id: { type: "string", required: true },
      reason: { type: "string", optional: true }
    }
  },
  
  // Scheduling
  scheduleTransfer: {
    description: "Schedule a recurring transfer",
    parameters: {
      name: { type: "string", required: true },
      cron: { type: "string", required: true },
      source_agent: { type: "string", required: true },
      source_path: { type: "string", required: true },
      destination_agent: { type: "string", required: true },
      destination_path: { type: "string", required: true }
    }
  },
  
  // Analytics
  analyzePerformance: {
    description: "Analyze transfer performance and get optimization suggestions",
    parameters: {
      time_range: { type: "string", default: "1h" },
      agent_id: { type: "string", optional: true },
      metric: { type: "string", enum: ["throughput", "reliability", "cost"] }
    }
  },
  
  // External Sharing
  createShareLink: {
    description: "Create an external share link for a file",
    parameters: {
      file_path: { type: "string", required: true },
      agent_id: { type: "string", required: true },
      expires_in: { type: "string", default: "24h" },
      password_protected: { type: "boolean", default: false },
      max_downloads: { type: "number", default: 1 }
    }
  }
};
```

### Available Resources

```typescript
// MCP resources for data access
const resources = {
  agents: {
    uri: "tcp-agent://agents",
    description: "List of all agents with their current status",
    mimeType: "application/json"
  },
  
  transfers: {
    uri: "tcp-agent://transfers",
    description: "Transfer history and active transfers",
    mimeType: "application/json"
  },
  
  analytics: {
    uri: "tcp-agent://analytics",
    description: "Performance metrics and analytics data",
    mimeType: "application/json"
  },
  
  schedules: {
    uri: "tcp-agent://schedules",
    description: "Configured transfer schedules",
    mimeType: "application/json"
  }
};
```

## API Key Management

### Creating an API Key

1. Navigate to **Settings → API Keys** in the dashboard
2. Click **"Create API Key"**
3. Configure:
   - **Name**: Descriptive name (e.g., "Production MCP Server")
   - **Role**: Select base permission level
   - **Scopes**: Fine-tune specific permissions
   - **Expiry**: Set expiration date
   - **IP Whitelist**: Restrict to specific IPs (optional)

4. Copy the generated key immediately (shown only once)

### API Key Structure
```
tcp_live_<32-byte-random-base64url>
```

### Available Scopes

```typescript
// Read operations
'agents:read'        // View agent information
'transfers:read'     // View transfer history
'analytics:read'     // View performance analytics
'schedules:read'     // View scheduled transfers

// Write operations
'transfers:create'   // Create new transfers
'transfers:cancel'   // Cancel active transfers
'schedules:manage'   // Create/modify schedules
'shares:create'      // Create external share links

// Configuration
'agents:configure'   // Modify agent settings
'bandwidth:manage'   // Configure bandwidth policies

// Administrative (Enterprise)
'projects:manage'    // Manage projects
'users:manage'       // Manage team members
'billing:view'       // View billing information
```

## Usage Examples

### Example 1: Daily Backup Automation

```typescript
// AI agent command: "Set up daily database backups to cloud storage"

await mcp.tool('scheduleTransfer', {
  name: 'Daily Database Backup',
  cron: '0 2 * * *', // 2 AM daily
  source_agent: 'prod-db-server',
  source_path: '/var/backups/database/latest.sql',
  destination_agent: 'cloud-storage-gateway',
  destination_path: 's3://backups/database/%Y-%m-%d.sql',
  options: {
    compress: true,
    encrypt: true,
    verify_checksum: true
  }
});
```

### Example 2: Performance Monitoring

```typescript
// AI agent command: "Check if any transfers are running slowly"

const performance = await mcp.tool('analyzePerformance', {
  time_range: '1h',
  metric: 'throughput'
});

if (performance.degraded_agents.length > 0) {
  // AI can suggest optimizations
  for (const agent of performance.degraded_agents) {
    console.log(`Agent ${agent.name} is performing at ${agent.efficiency}% efficiency`);
    console.log(`Suggested actions: ${agent.recommendations.join(', ')}`);
  }
}
```

### Example 3: Intelligent File Distribution

```typescript
// AI agent command: "Distribute the latest build to all regional servers"

// First, get list of online agents
const agents = await mcp.resource('agents');
const regionalServers = agents.filter(a => 
  a.tags.includes('regional-server') && a.status === 'online'
);

// Create transfers to each server
for (const server of regionalServers) {
  await mcp.tool('createTransfer', {
    source_agent: 'build-server',
    source_path: '/builds/latest/app.tar.gz',
    destination_agent: server.id,
    destination_path: '/deployments/app.tar.gz',
    priority: 'high',
    options: {
      verify_checksum: true
    }
  });
}
```

### Example 4: Cost-Optimized Transfers

```typescript
// AI agent command: "Schedule large transfers during off-peak hours to save costs"

const largeFiles = await mcp.tool('findLargeFiles', {
  min_size: '10GB',
  agent_id: 'data-warehouse'
});

for (const file of largeFiles) {
  await mcp.tool('scheduleTransfer', {
    name: `Cost-optimized transfer: ${file.name}`,
    cron: '0 3 * * 6,0', // 3 AM on weekends
    source_agent: file.agent_id,
    source_path: file.path,
    destination_agent: 'archive-storage',
    destination_path: `/archive/${file.name}`,
    options: {
      bandwidth_limit: 100 // Mbps, to avoid peak charges
    }
  });
}
```

## Setting Up MCP Server

### 1. Installation

```bash
npm install @anthropic/mcp-server-tcp-agent
```

### 2. Configuration

```typescript
// mcp-config.json
{
  "name": "tcp-agent",
  "description": "Control TCP Agent file transfers",
  "version": "1.0.0",
  "server": {
    "command": "node",
    "args": ["./mcp-server.js"]
  },
  "configuration": {
    "api_key": {
      "type": "string",
      "description": "TCP Agent API key",
      "required": true
    },
    "base_url": {
      "type": "string",
      "description": "TCP Agent platform URL",
      "default": "https://api.tcpagent.com"
    }
  }
}
```

### 3. Implementation

```typescript
// mcp-server.js
import { MCPServer } from '@anthropic/mcp';
import { TCPAgentClient } from './tcp-agent-client';

const server = new MCPServer({
  name: 'tcp-agent',
  version: '1.0.0'
});

const client = new TCPAgentClient({
  apiKey: process.env.TCP_AGENT_API_KEY,
  baseUrl: process.env.TCP_AGENT_BASE_URL
});

// Register tools
Object.entries(tools).forEach(([name, config]) => {
  server.registerTool(name, config, async (params) => {
    return await client.executeTool(name, params);
  });
});

// Register resources
Object.entries(resources).forEach(([name, config]) => {
  server.registerResource(config.uri, async () => {
    return await client.getResource(name);
  });
});

server.start();
```

## Rate Limiting

API rate limits by subscription tier:

| Tier | Requests/Minute | Burst Limit |
|------|-----------------|-------------|
| Starter | 60 | 100 |
| Professional | 300 | 500 |
| Enterprise | Custom | Custom |

## Security Considerations

1. **API Key Storage**: Never commit API keys to version control
2. **Scope Limitation**: Use minimum required scopes
3. **IP Whitelisting**: Restrict API keys to known IPs
4. **Key Rotation**: Regularly rotate API keys
5. **Audit Logging**: All MCP actions are logged

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify API key is correct
   - Check key hasn't expired
   - Ensure proper scopes are assigned

2. **Rate Limit Exceeded**
   - Implement exponential backoff
   - Consider upgrading tier
   - Batch operations when possible

3. **Permission Denied**
   - Verify API key has required scope
   - Check project/company access
   - Review audit logs

### Debug Mode

Enable debug logging:
```typescript
const client = new TCPAgentClient({
  apiKey: process.env.TCP_AGENT_API_KEY,
  debug: true // Enables detailed logging
});
```

## Best Practices

1. **Error Handling**: Always handle API errors gracefully
2. **Idempotency**: Design operations to be safely retryable
3. **Monitoring**: Track API usage and performance
4. **Documentation**: Document your MCP workflows
5. **Testing**: Test with development API keys first