# TCP Agent Platform API v1 Reference

## Base URL

```
Production: https://your-project.supabase.co/functions/v1/api-gateway
Local: http://localhost:54321/functions/v1/api-gateway
```

## Authentication

All endpoints require authentication unless specified otherwise.

### User Authentication
Use the JWT token from Supabase Auth in the Authorization header:
```
Authorization: Bearer <user_jwt_token>
```

### Agent Authentication
Use the JWT token received from agent registration:
```
Authorization: Bearer <agent_jwt_token>
```

## Endpoints

### Projects

#### List Projects
```http
GET /projects
Authorization: Bearer <user_token>
```

Response:
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "My Project",
      "slug": "my-project",
      "company_id": "uuid",
      "settings": {},
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Get Project
```http
GET /projects/:id
Authorization: Bearer <user_token>
```

#### Create Project
```http
POST /projects
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "name": "New Project",
  "slug": "new-project" // optional
}
```

#### Update Project
```http
PUT /projects/:id
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "settings": {}
}
```

#### Delete Project
```http
DELETE /projects/:id
Authorization: Bearer <user_token>
```

### Agents

#### List Agents
```http
GET /agents
Authorization: Bearer <user_token>
```

Response:
```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "Agent 1",
      "platform": "linux",
      "status": "active",
      "capabilities": {},
      "last_seen_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Get Agent
```http
GET /agents/:id
Authorization: Bearer <user_token>
```

#### Create Agent
```http
POST /agents
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "name": "New Agent",
  "platform": "linux|windows|darwin",
  "capabilities": {
    "transfer": true,
    "compress": true,
    "encrypt": true
  }
}
```

#### Update Agent
```http
PUT /agents/:id
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "capabilities": {},
  "settings": {}
}
```

#### Delete Agent
```http
DELETE /agents/:id
Authorization: Bearer <user_token>
```

#### Generate Registration Token
```http
POST /agents/:id/register
Authorization: Bearer <user_token>
```

Response:
```json
{
  "token": "secure_random_token",
  "expires_at": "2024-01-01T00:15:00Z",
  "agent_id": "uuid"
}
```

#### Authenticate Agent (No Auth Required)
```http
POST /agents/authenticate
Content-Type: application/json

{
  "token": "registration_token",
  "api_key": "agent_generated_api_key"
}
```

Response:
```json
{
  "jwt": "agent_jwt_token",
  "agent": {
    "id": "uuid",
    "name": "Agent Name",
    "project_id": "uuid"
  }
}
```

### Telemetry

#### Submit Telemetry (Agent Auth)
```http
POST /telemetry
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "metrics": {
    "cpu_usage": 45.2,
    "memory_usage": 2048,
    "disk_usage": 10240,
    "network_rx": 1024,
    "network_tx": 512,
    "active_transfers": 2
  },
  "timestamp": "2024-01-01T00:00:00Z" // optional
}
```

#### Submit Batch Telemetry (Agent Auth)
```http
POST /telemetry/batch
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "telemetry": [
    {
      "metrics": {},
      "timestamp": "2024-01-01T00:00:00Z"
    },
    {
      "metrics": {},
      "timestamp": "2024-01-01T00:01:00Z"
    }
  ]
}
```

#### Get Agent Telemetry (User Auth)
```http
GET /telemetry/agent/:id
Authorization: Bearer <user_token>
```

Response:
```json
{
  "telemetry": [
    {
      "id": "uuid",
      "agent_id": "uuid",
      "timestamp": "2024-01-01T00:00:00Z",
      "metrics": {}
    }
  ]
}
```

#### Get Project Telemetry (User Auth)
```http
GET /telemetry/project/:id
Authorization: Bearer <user_token>
```

Response:
```json
{
  "aggregates": {
    "total_agents": 5,
    "active_agents": 3,
    "total_data_points": 1500
  },
  "agents": [
    {
      "agent_id": "uuid",
      "agent_name": "Agent 1",
      "telemetry": []
    }
  ]
}
```

## Error Responses

All errors follow this format:
```json
{
  "error": {
    "message": "Human readable error message",
    "code": "ERROR_CODE",
    "status": 400
  }
}
```

Common error codes:
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Rate Limiting

Rate limits are enforced per user/agent:
- Free tier: 100 requests per 15 minutes
- Pro tier: 1000 requests per 15 minutes
- Enterprise tier: 10000 requests per 15 minutes

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-01T00:15:00Z
```

## Security Headers

All responses include security headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; ...
```