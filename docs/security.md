# Security Model

## Overview

The TCP Agent Platform implements defense-in-depth security with multiple layers of protection for multi-tenant data isolation, secure communications, and compliance requirements.

## Authentication

### User Authentication
- **Primary**: Supabase Auth with JWT tokens
- **MFA**: TOTP-based two-factor authentication (Enterprise)
- **SSO**: SAML 2.0 integration (Enterprise)
- **Session Management**: 
  - Access tokens: 1 hour expiry
  - Refresh tokens: 7 days (configurable)
  - Secure HttpOnly cookies for web sessions

### Agent Authentication
```typescript
// Agent registration flow
1. Admin generates one-time registration token (15-minute expiry)
2. Agent exchanges token for JWT credentials
3. Agent stores refresh token securely (chmod 600)
4. Agent uses short-lived access tokens for API calls
```

### API Key Authentication
```typescript
// API key structure
tcp_live_<32-byte-random-base64url>

// Storage
- Only key hash stored in database (SHA-256)
- Key shown once during creation
- Automatic expiry and rotation supported
```

## Authorization

### Role-Based Access Control (RBAC)

#### Company Roles
```typescript
const companyRoles = {
  'owner': {
    // Full control including billing and company deletion
    billing: 'full',
    team: 'full',
    projects: 'full',
    settings: 'full',
    canTransferOwnership: true,
    canDeleteCompany: true
  },
  'billing_admin': {
    // Finance team - subscription management only
    billing: 'full',
    team: 'none',
    projects: 'view',
    settings: 'none'
  },
  'admin': {
    // IT/Operations - technical management
    billing: 'view',
    team: 'manage',
    projects: 'full',
    settings: 'edit'
  },
  'member': {
    // Regular users - need project assignment
    billing: 'none',
    team: 'view',
    projects: 'assigned_only',
    settings: 'none'
  }
};
```

#### Project Roles
```typescript
const projectRoles = {
  'project_owner': {
    agents: 'full',
    transfers: 'full',
    settings: 'full',
    team: 'full',
    canDelete: true
  },
  'project_admin': {
    agents: 'full',
    transfers: 'full',
    settings: 'edit',
    team: 'manage'
  },
  'developer': {
    agents: 'manage',
    transfers: 'view',
    settings: 'view',
    team: 'view'
  },
  'analyst': {
    agents: 'view',
    transfers: 'view',
    settings: 'none',
    team: 'none'
  }
};
```

### API Scopes
```typescript
// Granular API permissions
const apiScopes = {
  // Read operations
  'agents:read': 'View agent information',
  'transfers:read': 'View transfer history',
  'analytics:read': 'View performance analytics',
  
  // Write operations
  'transfers:create': 'Create new transfers',
  'transfers:cancel': 'Cancel active transfers',
  'agents:configure': 'Modify agent settings',
  
  // Administrative operations
  'projects:manage': 'Create/delete projects',
  'users:manage': 'Manage team members',
  'billing:manage': 'Modify subscription'
};
```

## Data Protection

### Encryption

#### At Rest
- PostgreSQL transparent data encryption
- Encrypted file storage for transfer data
- Credential encryption using AES-256-GCM
- Key management via environment variables

#### In Transit
- TLS 1.3 for all HTTPS connections
- WebSocket Secure (WSS) for real-time data
- Certificate pinning for agent connections (optional)
- End-to-end encryption for sensitive transfers (Enterprise)

### Multi-Tenant Isolation

#### Row Level Security (RLS)
```sql
-- Enforced at database level
-- Example: Users only see their project's data
CREATE POLICY "project_isolation" ON transfers
  FOR ALL USING (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid()
    )
  );
```

#### Data Segregation
- Separate database schemas per company (Enterprise)
- Dedicated compute resources (Enterprise)
- Geographic data residency options
- Automated data purging based on retention policies

## Security Features by Tier

### All Tiers
- Basic authentication and authorization
- TLS encryption
- Row Level Security
- Password policies

### Professional & Enterprise
- API key management
- IP allowlisting
- Advanced audit logging
- Custom security policies

### Enterprise Only
- Single Sign-On (SSO)
- Multi-factor authentication enforcement
- Compliance reporting (SOC 2, HIPAA)
- Data Loss Prevention (DLP)
- Custom encryption keys
- Dedicated security review

## Compliance & Audit

### Audit Logging
```typescript
// Comprehensive audit trail
interface AuditLog {
  id: string;
  timestamp: Date;
  user_id: string;
  company_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  user_agent: string;
  details: {
    before?: any;
    after?: any;
    reason?: string;
  };
}

// Logged actions include:
- Authentication events
- Permission changes
- Data access/modifications
- API key usage
- Administrative actions
```

### Compliance Standards
- **GDPR**: Data portability, right to deletion
- **SOC 2**: Annual audits, security controls
- **HIPAA**: BAA available, encryption requirements
- **ISO 27001**: Information security management

## Security Best Practices

### Password Requirements
- Minimum 12 characters
- Complexity requirements
- No common passwords (HIBP integration)
- Regular rotation reminders
- Breach monitoring

### Session Security
- Automatic logout after inactivity
- Concurrent session limits
- Device fingerprinting
- Suspicious activity detection

### API Security
- Rate limiting by tier and endpoint
- Request signing for sensitive operations
- Automatic key rotation
- Usage analytics and anomaly detection

## Incident Response

### Security Monitoring
- Real-time threat detection
- Automated alerting
- Security dashboard
- Integration with SIEM systems

### Response Plan
1. **Detection**: Automated monitoring and alerting
2. **Containment**: Automatic account/key suspension
3. **Investigation**: Comprehensive audit trails
4. **Remediation**: Forced password resets, key rotation
5. **Communication**: Customer notification procedures

## Security Headers

```typescript
// Applied to all responses
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
```

## Vulnerability Management

### Dependency Scanning
- Automated security updates
- CVE monitoring
- License compliance
- Supply chain security

### Penetration Testing
- Annual third-party assessments (Enterprise)
- Continuous security scanning
- Bug bounty program
- Security scorecard

## Data Privacy

### Data Collection
- Minimal data collection principle
- Explicit consent for analytics
- Transparent privacy policy
- User data access requests

### Data Retention
- Configurable by tier
- Automatic purging
- Secure deletion
- Backup encryption

## Security Contacts

- Security issues: security@tcpagent.com
- Responsible disclosure program
- 24/7 incident response (Enterprise)
- Security advisory notifications