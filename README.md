# TCP Agent SaaS Platform

A multi-tenant SaaS platform for managing high-performance TCP Agent file transfers with real-time monitoring, AI integration, and enterprise-grade security.

## Overview

This platform transforms the TCP Agent (1+ Gbps file transfer system with AI optimization) into a comprehensive enterprise SaaS solution. It provides centralized management, real-time monitoring, and AI-powered orchestration for distributed file transfer infrastructure.

## Key Features

### Core Capabilities
- **Multi-Tenant Architecture**: Company → Project → User hierarchy with flexible roles
- **Real-Time Monitoring**: Live telemetry from all agents with sub-second updates
- **AI-Native Design**: Full MCP (Model Context Protocol) integration for AI agent control
- **Enterprise Security**: Row-level security, SSO, audit logs, and compliance features
- **Tiered Subscriptions**: Free, Starter, Professional, and Enterprise tiers

### Transfer Features
- **Resume & Checkpointing**: Automatic resume for interrupted transfers
- **Scheduled Transfers**: Cron-based and event-driven automation
- **Bandwidth Management**: QoS, time-based throttling, and cost optimization
- **Cloud Integration**: Direct S3, GCS, and Azure transfers
- **External Sharing**: Secure one-time links for external recipients

## Architecture

### Technology Stack
- **Backend**: Supabase (PostgreSQL, Realtime, Edge Functions, Auth)
- **Frontend**: React with React Router, TypeScript, Tailwind CSS
- **Agent**: Go-based TCP Agent with platform integration
- **AI**: MCP server for AI agent integration
- **Payments**: Stripe for subscription management

### Project Structure
```
tcp-agent-platform/
├── apps/
│   ├── web/                    # React SaaS application
│   ├── mcp-server/            # MCP server for AI integration
│   └── agent-sdk/             # Go SDK modifications
├── supabase/
│   ├── migrations/            # Database schema
│   └── functions/            # Edge Functions
└── docs/                     # Documentation
```

## Getting Started

### Prerequisites
- Node.js 18+
- Go 1.21+
- Supabase CLI
- Docker (for local development)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/tcp-agent-platform.git
cd tcp-agent-platform

# Install dependencies
npm install

# Set up Supabase
supabase init
supabase start
```

### Configuration
Create a `.env.local` file:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
STRIPE_SECRET_KEY=your_stripe_key
```

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Database Schema](docs/database-schema.md)
- [Security Model](docs/security.md)
- [API Reference](docs/api-reference.md)
- [MCP Integration](docs/mcp-integration.md)
- [Deployment Guide](docs/deployment.md)

## License

This project is proprietary software. All rights reserved.