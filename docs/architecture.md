# Architecture Overview

## System Architecture

The TCP Agent SaaS Platform consists of several interconnected components:

```
┌─────────────────┐     HTTPS/JWT      ┌──────────────────┐     ┌──────────────┐
│   TCP Agents    ├──────────────────►│ Supabase Edge Fn │◄────│ Web Dashboard│
│  (Go, 1000s)    │                    │  (Registration,  │     │   (React)    │
└────────┬────────┘                    │   Config, Auth)  │     └──────────────┘
         │                             └──────────────────┘              ▲
         │ WebSocket                            │                        │
         │ (Telemetry)                         │ PostgreSQL              │ Real-time
         ▼                                      ▼                        │ Updates
┌─────────────────┐                    ┌──────────────────┐             │
│Supabase Realtime│◄───────────────────│ Supabase DB +RLS │◄────────────┘
│  (WebSockets)   │                    │ (Multi-tenant)   │
└─────────────────┘                    └──────────────────┘
         ▲                                      ▲
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                 ┌──────────────┐
                 │  MCP Server  │
                 │ (AI Access)  │
                 └──────────────┘
```

## Core Components

### 1. TCP Agents (Go)
- High-performance file transfer agents achieving 1+ Gbps
- AI-powered optimization for network conditions
- Platform integration for centralized management
- Telemetry reporting every 100ms-30s (based on tier)

### 2. Supabase Backend
- **PostgreSQL Database**: Multi-tenant data with Row Level Security
- **Realtime Service**: WebSocket connections for live updates
- **Edge Functions**: Serverless API endpoints
- **Auth Service**: JWT-based authentication with role management

### 3. Web Dashboard (React)
- Real-time monitoring interface
- Agent and transfer management
- User and project administration
- Billing and subscription management

### 4. MCP Server
- Exposes platform functionality to AI agents
- Enables natural language control
- Supports workflow automation
- API key-based authentication

## Data Flow

### 1. Agent Registration
```
Agent → Edge Function → Database → JWT Token → Agent
```

### 2. Real-time Telemetry
```
Agent → WebSocket → Realtime Service → Database → Dashboard
                                    ↓
                                 Analytics
```

### 3. Transfer Execution
```
Dashboard/API → Edge Function → Database → Agent Notification
                                         ↓
                              Transfer Execution
                                         ↓
                              Progress Updates → Dashboard
```

## Multi-Tenancy Model

### Hierarchy
```
Company
├── Projects
│   ├── Agents
│   ├── Transfers
│   └── Schedules
└── Users
    └── Roles & Permissions
```

### Security Boundaries
- Row Level Security (RLS) enforces data isolation
- Users only see data from assigned projects
- Company admins have cross-project visibility
- API keys scoped to specific projects/permissions

## Subscription Tiers

### Free Tier
- 2 agents, 1 project
- 30-second telemetry updates
- 7-day data retention
- Basic features only

### Starter ($49/month)
- 10 agents, 3 projects
- 5-second telemetry updates
- 30-day data retention
- Email alerts, basic API

### Professional ($199/month)
- 50 agents, 10 projects
- 1-second telemetry updates
- 90-day data retention
- Custom roles, analytics, webhooks

### Enterprise (Custom)
- Unlimited agents/projects
- 100ms telemetry updates
- 365-day data retention
- SSO, audit logs, SLA, custom integrations

## Scalability Considerations

### Connection Management
- Self-hosted Supabase removes connection limits
- Telemetry batching for high agent counts
- Materialized views for dashboard performance
- Time-series partitioning for telemetry data

### Performance Optimizations
- Client-side throttling for UI updates
- Aggregated metrics for overview dashboards
- Async job processing for heavy operations
- CDN for static assets

## Security Architecture

### Authentication
- JWT-based with refresh tokens
- Multi-factor authentication (Enterprise)
- SSO integration (Enterprise)
- API key management for programmatic access

### Authorization
- Role-based access control (RBAC)
- Project-level permissions
- Granular API scopes
- Audit logging for compliance

### Data Protection
- Encryption at rest (PostgreSQL)
- TLS for all communications
- Secure credential storage
- GDPR-compliant data handling

## Integration Points

### External Services
- **Stripe**: Subscription billing
- **SendGrid/Resend**: Email notifications
- **Slack/Teams**: Alert integrations
- **Cloud Storage**: S3, GCS, Azure

### AI Integration
- MCP server for AI agent access
- Natural language query interface
- Automated workflow orchestration
- Performance optimization recommendations