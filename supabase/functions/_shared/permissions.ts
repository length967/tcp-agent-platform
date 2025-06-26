/**
 * Central permission definitions for the TCP Agent Platform
 */

export const Permissions = {
  // Company-level permissions
  COMPANY_VIEW: 'company:view',
  COMPANY_EDIT: 'company:edit',
  COMPANY_VIEW_SETTINGS: 'company:view_settings',
  COMPANY_EDIT_SETTINGS: 'company:edit_settings',
  
  // Timezone-specific permissions
  TIMEZONE_VIEW_COMPANY: 'timezone:view_company',
  TIMEZONE_EDIT_COMPANY: 'timezone:edit_company',
  TIMEZONE_ENFORCE: 'timezone:enforce',
  BUSINESS_HOURS_EDIT: 'business_hours:edit',
  
  // Member management
  MEMBERS_VIEW: 'members:view',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_MANAGE: 'members:manage',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_ROLE_CHANGE: 'members:change_role',
  USER_SUSPEND: 'user:suspend',
  
  // Project management
  PROJECT_CREATE: 'project:create',
  PROJECT_DELETE: 'project:delete',
  PROJECT_EDIT: 'project:edit',
  PROJECT_VIEW: 'project:view',
  
  // Agent management
  AGENT_CREATE: 'agent:create',
  AGENT_DELETE: 'agent:delete',
  AGENT_EDIT: 'agent:edit',
  AGENT_VIEW: 'agent:view',
  AGENT_REGISTER: 'agent:register',
  
  // Transfer management
  TRANSFER_CREATE: 'transfer:create',
  TRANSFER_DELETE: 'transfer:delete',
  TRANSFER_EDIT: 'transfer:edit',
  TRANSFER_VIEW: 'transfer:view',
  
  // Telemetry
  TELEMETRY_VIEW: 'telemetry:view',
  TELEMETRY_EXPORT: 'telemetry:export',
  
  // Billing (company level only)
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',
  
  // User preferences (self-service)
  USER_PREFERENCES_EDIT: 'user:edit_preferences',
} as const

export type Permission = typeof Permissions[keyof typeof Permissions]

/**
 * Role definitions with their associated permissions
 */
export const CompanyRoles = {
  owner: [
    // All permissions
    ...Object.values(Permissions),
  ],
  admin: [
    // All permissions except ownership transfer
    Permissions.COMPANY_VIEW,
    Permissions.COMPANY_EDIT,
    Permissions.COMPANY_VIEW_SETTINGS,
    Permissions.COMPANY_EDIT_SETTINGS,
    Permissions.TIMEZONE_VIEW_COMPANY,
    Permissions.TIMEZONE_EDIT_COMPANY,
    Permissions.TIMEZONE_ENFORCE,
    Permissions.BUSINESS_HOURS_EDIT,
    Permissions.MEMBERS_VIEW,
    Permissions.MEMBERS_INVITE,
    Permissions.MEMBERS_MANAGE,
    Permissions.MEMBERS_REMOVE,
    Permissions.MEMBERS_ROLE_CHANGE,
    Permissions.USER_SUSPEND,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_DELETE,
    Permissions.PROJECT_EDIT,
    Permissions.PROJECT_VIEW,
    Permissions.AGENT_CREATE,
    Permissions.AGENT_DELETE,
    Permissions.AGENT_EDIT,
    Permissions.AGENT_VIEW,
    Permissions.AGENT_REGISTER,
    Permissions.TRANSFER_CREATE,
    Permissions.TRANSFER_DELETE,
    Permissions.TRANSFER_EDIT,
    Permissions.TRANSFER_VIEW,
    Permissions.TELEMETRY_VIEW,
    Permissions.TELEMETRY_EXPORT,
    Permissions.BILLING_VIEW,
    Permissions.USER_PREFERENCES_EDIT,
  ],
  member: [
    // Basic read permissions and self-service capabilities
    Permissions.COMPANY_VIEW,
    Permissions.TIMEZONE_VIEW_COMPANY,
    Permissions.MEMBERS_VIEW,
    Permissions.PROJECT_VIEW,
    Permissions.AGENT_VIEW,
    Permissions.TRANSFER_VIEW,
    Permissions.TELEMETRY_VIEW,
    Permissions.USER_PREFERENCES_EDIT, // Users can edit their own preferences
  ],
} as const

export const ProjectRoles = {
  admin: [
    // Full project control
    Permissions.PROJECT_EDIT,
    Permissions.PROJECT_VIEW,
    Permissions.AGENT_CREATE,
    Permissions.AGENT_DELETE,
    Permissions.AGENT_EDIT,
    Permissions.AGENT_VIEW,
    Permissions.AGENT_REGISTER,
    Permissions.TRANSFER_CREATE,
    Permissions.TRANSFER_DELETE,
    Permissions.TRANSFER_EDIT,
    Permissions.TRANSFER_VIEW,
    Permissions.TELEMETRY_VIEW,
    Permissions.TELEMETRY_EXPORT,
  ],
  editor: [
    // Can manage transfers and agents but not project settings
    Permissions.PROJECT_VIEW,
    Permissions.AGENT_CREATE,
    Permissions.AGENT_EDIT,
    Permissions.AGENT_VIEW,
    Permissions.AGENT_REGISTER,
    Permissions.TRANSFER_CREATE,
    Permissions.TRANSFER_EDIT,
    Permissions.TRANSFER_VIEW,
    Permissions.TELEMETRY_VIEW,
  ],
  viewer: [
    // Read-only access
    Permissions.PROJECT_VIEW,
    Permissions.AGENT_VIEW,
    Permissions.TRANSFER_VIEW,
    Permissions.TELEMETRY_VIEW,
  ],
} as const

export type CompanyRole = keyof typeof CompanyRoles
export type ProjectRole = keyof typeof ProjectRoles

/**
 * Get permissions for a combination of company and project roles
 */
export function getCombinedPermissions(
  companyRole: CompanyRole | null,
  projectRole: ProjectRole | null
): Permission[] {
  const permissions = new Set<Permission>()
  
  // Add company permissions
  if (companyRole && CompanyRoles[companyRole]) {
    CompanyRoles[companyRole].forEach(p => permissions.add(p))
  }
  
  // Add project permissions (if not already covered by company role)
  if (projectRole && ProjectRoles[projectRole]) {
    ProjectRoles[projectRole].forEach(p => permissions.add(p))
  }
  
  return Array.from(permissions)
}

/**
 * Check if a set of permissions includes a required permission
 */
export function hasPermission(
  userPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  return userPermissions.includes(requiredPermission)
}

/**
 * Check if a set of permissions includes any of the required permissions
 */
export function hasAnyPermission(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.some(p => userPermissions.includes(p))
}

/**
 * Check if a set of permissions includes all of the required permissions
 */
export function hasAllPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every(p => userPermissions.includes(p))
}

/**
 * Timezone-specific permission validation functions
 */
export function canEditCompanyTimezone(userPermissions: Permission[]): boolean {
  return hasAnyPermission(userPermissions, [
    Permissions.TIMEZONE_EDIT_COMPANY,
    Permissions.COMPANY_EDIT_SETTINGS
  ])
}

export function canViewCompanyTimezone(userPermissions: Permission[]): boolean {
  return hasAnyPermission(userPermissions, [
    Permissions.TIMEZONE_VIEW_COMPANY,
    Permissions.TIMEZONE_EDIT_COMPANY,
    Permissions.COMPANY_VIEW_SETTINGS
  ])
}

export function canEnforceTimezone(userPermissions: Permission[]): boolean {
  return hasPermission(userPermissions, Permissions.TIMEZONE_ENFORCE)
}

export function canEditBusinessHours(userPermissions: Permission[]): boolean {
  return hasAnyPermission(userPermissions, [
    Permissions.BUSINESS_HOURS_EDIT,
    Permissions.TIMEZONE_EDIT_COMPANY
  ])
}

export function canEditUserPreferences(userPermissions: Permission[]): boolean {
  return hasPermission(userPermissions, Permissions.USER_PREFERENCES_EDIT)
}