import { Context } from '../../_shared/middleware.ts'
import { 
  hasPermission, 
  Permissions, 
  getProjectPermissions,
  canManageProjectRole 
} from '../../_shared/permissions.ts'
import { 
  AuthorizationError,
  BadRequestError,
  NotFoundError 
} from '../../_shared/errors.ts'

export async function handleProjectMembers(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /v1/projects/:projectId/members - List project members
  // POST /v1/projects/:projectId/members - Add project member
  // PATCH /v1/projects/:projectId/members/:userId - Update member role
  // DELETE /v1/projects/:projectId/members/:userId - Remove member
  
  const method = req.method
  const projectId = pathParts[3] // After /api-gateway/v1/projects/
  const userId = pathParts[5] // After /api-gateway/v1/projects/:projectId/members/
  
  const supabase = ctx.supabase!
  const currentUserId = ctx.userId!
  const tenantId = ctx.tenantId!
  
  if (!projectId || projectId === 'members') {
    throw new BadRequestError('Project ID is required')
  }
  
  switch (method) {
    case 'GET':
      return listProjectMembers(supabase, projectId, currentUserId)
    
    case 'POST':
      return addProjectMember(req, supabase, projectId, currentUserId, tenantId)
    
    case 'PATCH':
      if (!userId) {
        throw new BadRequestError('User ID is required')
      }
      return updateProjectMember(req, supabase, projectId, userId, currentUserId)
    
    case 'DELETE':
      if (!userId) {
        throw new BadRequestError('User ID is required')
      }
      return removeProjectMember(supabase, projectId, userId, currentUserId)
    
    default:
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        }
      )
  }
}

async function listProjectMembers(
  supabase: any,
  projectId: string,
  currentUserId: string
): Promise<Response> {
  // Check if user has access to view project members
  const projectPermissions = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  )
  
  if (!hasPermission(projectPermissions, Permissions.PROJECT_VIEW)) {
    throw new AuthorizationError('You do not have permission to view this project')
  }

  // Fetch project members with user details
  const { data: members, error } = await supabase
    .from('project_members')
    .select(`
      project_id,
      user_id,
      role,
      added_at,
      added_by,
      user:profiles!project_members_user_id_fkey (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('project_id', projectId)

  if (error) {
    console.error('Error fetching project members:', error)
    throw new Error('Failed to fetch project members')
  }

  return new Response(
    JSON.stringify({ members }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function addProjectMember(
  req: Request,
  supabase: any,
  projectId: string,
  currentUserId: string,
  tenantId: string
): Promise<Response> {
  const { user_id, role } = await req.json()
  
  if (!user_id || !role) {
    throw new BadRequestError('User ID and role are required')
  }

  // Validate role
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    throw new BadRequestError('Invalid project role')
  }

  // Check if user has permission to add members
  const projectPermissions = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  )

  if (!hasPermission(projectPermissions, Permissions.PROJECT_MANAGE_MEMBERS)) {
    throw new AuthorizationError('You do not have permission to manage project members')
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', user_id)
    .single()

  if (existingMember) {
    throw new BadRequestError('User is already a member of this project')
  }

  // Verify the user exists in the company
  const { data: companyMember } = await supabase
    .from('company_members')
    .select('user_id')
    .eq('company_id', tenantId)
    .eq('user_id', user_id)
    .single()

  if (!companyMember) {
    throw new BadRequestError('User is not a member of your company')
  }

  // Add the member
  const { data: newMember, error } = await supabase
    .from('project_members')
    .insert({
      project_id: projectId,
      user_id,
      role,
      added_by: currentUserId
    })
    .select(`
      project_id,
      user_id,
      role,
      added_at,
      added_by,
      user:profiles!project_members_user_id_fkey (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .single()

  if (error) {
    console.error('Error adding project member:', error)
    throw new Error('Failed to add project member')
  }

  return new Response(
    JSON.stringify({ member: newMember }),
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function updateProjectMember(
  req: Request,
  supabase: any,
  projectId: string,
  userId: string,
  currentUserId: string
): Promise<Response> {
  const { role } = await req.json()
  
  if (!role) {
    throw new BadRequestError('Role is required')
  }

  // Validate role
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    throw new BadRequestError('Invalid project role')
  }

  // Check if user has permission to manage members
  const projectPermissions = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  )

  if (!hasPermission(projectPermissions, Permissions.PROJECT_MANAGE_MEMBERS)) {
    throw new AuthorizationError('You do not have permission to manage project members')
  }

  // Get current member role
  const { data: currentMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (!currentMember) {
    throw new NotFoundError('Project member not found')
  }

  // Check if user can manage this specific role change
  const userProjectRole = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  ).then(perms => {
    // Extract role from permissions
    if (hasPermission(perms, Permissions.PROJECT_DELETE)) return 'admin'
    if (hasPermission(perms, Permissions.PROJECT_MANAGE_MEMBERS)) return 'admin'
    if (hasPermission(perms, Permissions.PROJECT_UPDATE)) return 'editor'
    return 'viewer'
  })

  if (!canManageProjectRole(userProjectRole as any, currentMember.role) ||
      !canManageProjectRole(userProjectRole as any, role)) {
    throw new AuthorizationError('You cannot manage users with this role level')
  }

  // Prevent users from changing their own role
  if (userId === currentUserId) {
    throw new BadRequestError('You cannot change your own role')
  }

  // Update the member role
  const { data: updatedMember, error } = await supabase
    .from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select(`
      project_id,
      user_id,
      role,
      added_at,
      added_by,
      user:profiles!project_members_user_id_fkey (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .single()

  if (error) {
    console.error('Error updating project member:', error)
    throw new Error('Failed to update project member')
  }

  return new Response(
    JSON.stringify({ member: updatedMember }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function removeProjectMember(
  supabase: any,
  projectId: string,
  userId: string,
  currentUserId: string
): Promise<Response> {
  // Check if user has permission to manage members
  const projectPermissions = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  )

  if (!hasPermission(projectPermissions, Permissions.PROJECT_MANAGE_MEMBERS)) {
    throw new AuthorizationError('You do not have permission to manage project members')
  }

  // Get current member role
  const { data: currentMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (!currentMember) {
    throw new NotFoundError('Project member not found')
  }

  // Check if user can manage this specific role
  const userProjectRole = await getProjectPermissions(
    supabase,
    currentUserId,
    projectId
  ).then(perms => {
    // Extract role from permissions
    if (hasPermission(perms, Permissions.PROJECT_DELETE)) return 'admin'
    if (hasPermission(perms, Permissions.PROJECT_MANAGE_MEMBERS)) return 'admin'
    if (hasPermission(perms, Permissions.PROJECT_UPDATE)) return 'editor'
    return 'viewer'
  })

  if (!canManageProjectRole(userProjectRole as any, currentMember.role)) {
    throw new AuthorizationError('You cannot remove users with this role level')
  }

  // Prevent users from removing themselves
  if (userId === currentUserId) {
    throw new BadRequestError('You cannot remove yourself from the project')
  }

  // Check if this is the last admin
  if (currentMember.role === 'admin') {
    const { count } = await supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('role', 'admin')

    if (count === 1) {
      throw new BadRequestError('Cannot remove the last project admin')
    }
  }

  // Remove the member
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error removing project member:', error)
    throw new Error('Failed to remove project member')
  }

  return new Response(
    JSON.stringify({ success: true }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}