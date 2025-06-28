export type Permission = string

export const Permissions = {
  // Company permissions
  COMPANY_VIEW: 'company:view',
  COMPANY_VIEW_SETTINGS: 'company:view_settings',
  COMPANY_EDIT_SETTINGS: 'company:edit_settings',
  COMPANY_EDIT_PRIVACY: 'company:edit_privacy',
  COMPANY_MANAGE_SECURITY: 'company:manage_security',
  
  // Timezone permissions
  TIMEZONE_VIEW_COMPANY: 'timezone:view_company',
  TIMEZONE_EDIT_COMPANY: 'timezone:edit_company',
  TIMEZONE_ENFORCE: 'timezone:enforce',
  BUSINESS_HOURS_EDIT: 'business_hours:edit',
  
  // Project permissions
  PROJECT_VIEW: 'project:view',
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_MEMBERS: 'project:manage_members',
  
  // Team permissions
  TEAM_VIEW: 'team:view',
  TEAM_MANAGE: 'team:manage',
  TEAM_INVITE: 'team:invite',
  
  // Join request permissions
  JOIN_REQUEST_VIEW: 'join_request:view',
  JOIN_REQUEST_APPROVE: 'join_request:approve',
  JOIN_REQUEST_REJECT: 'join_request:reject'
} as const

export type CompanyRole = 'owner' | 'admin' | 'member'
export type ProjectRole = 'admin' | 'editor' | 'viewer'

// Company role permissions
export const CompanyRoles: Record<CompanyRole, Permission[]> = {
  owner: Object.values(Permissions), // Owners have all permissions
  admin: [
    Permissions.COMPANY_VIEW,
    Permissions.COMPANY_VIEW_SETTINGS,
    Permissions.COMPANY_EDIT_SETTINGS,
    Permissions.TIMEZONE_VIEW_COMPANY,
    Permissions.TIMEZONE_EDIT_COMPANY,
    Permissions.TIMEZONE_ENFORCE,
    Permissions.BUSINESS_HOURS_EDIT,
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_CREATE,
    Permissions.PROJECT_EDIT,
    Permissions.PROJECT_DELETE,
    Permissions.PROJECT_MANAGE_MEMBERS,
    Permissions.TEAM_VIEW,
    Permissions.TEAM_MANAGE,
    Permissions.TEAM_INVITE,
    Permissions.JOIN_REQUEST_VIEW,
    Permissions.JOIN_REQUEST_APPROVE,
    Permissions.JOIN_REQUEST_REJECT
  ],
  member: [
    Permissions.COMPANY_VIEW,
    Permissions.COMPANY_VIEW_SETTINGS,
    Permissions.TIMEZONE_VIEW_COMPANY,
    Permissions.PROJECT_VIEW,
    Permissions.TEAM_VIEW
  ]
}

// Project role permissions
export const ProjectRoles: Record<ProjectRole, Permission[]> = {
  admin: [
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_EDIT,
    Permissions.PROJECT_DELETE,
    Permissions.PROJECT_MANAGE_MEMBERS
  ],
  editor: [
    Permissions.PROJECT_VIEW,
    Permissions.PROJECT_EDIT
  ],
  viewer: [
    Permissions.PROJECT_VIEW
  ]
}

// Helper functions
export function hasPermission(userPermissions: Permission[], requiredPermission: Permission): boolean {
  return userPermissions.includes(requiredPermission)
}

export function getCombinedPermissions(companyRole: CompanyRole | null, projectRole: ProjectRole | null): Permission[] {
  const permissions = new Set<Permission>()
  
  if (companyRole && CompanyRoles[companyRole]) {
    CompanyRoles[companyRole].forEach(p => permissions.add(p))
  }
  
  if (projectRole && ProjectRoles[projectRole]) {
    ProjectRoles[projectRole].forEach(p => permissions.add(p))
  }
  
  return Array.from(permissions)
}

export function getProjectPermissions(projectRole: ProjectRole | null): Permission[] {
  if (!projectRole || !ProjectRoles[projectRole]) return []
  return ProjectRoles[projectRole]
}

// Specific permission checks
export function canEditCompanyTimezone(permissions: Permission[]): boolean {
  return hasPermission(permissions, Permissions.TIMEZONE_EDIT_COMPANY)
}

export function canViewCompanyTimezone(permissions: Permission[]): boolean {
  return hasPermission(permissions, Permissions.TIMEZONE_VIEW_COMPANY)
}

export function canEnforceTimezone(permissions: Permission[]): boolean {
  return hasPermission(permissions, Permissions.TIMEZONE_ENFORCE)
}

export function canEditBusinessHours(permissions: Permission[]): boolean {
  return hasPermission(permissions, Permissions.BUSINESS_HOURS_EDIT)
}

export function canManageProjectRole(permissions: Permission[]): boolean {
  return hasPermission(permissions, Permissions.PROJECT_MANAGE_MEMBERS)
}

export function canEditUserPreferences(permissions: Permission[]): boolean {
  // Users can always edit their own preferences
  return true
}