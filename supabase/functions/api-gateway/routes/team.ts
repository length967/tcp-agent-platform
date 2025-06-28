import { Context } from '../../_shared/middleware.ts'
import { ApiError, AuthorizationError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuthorization } from '../../_shared/auth/userAuth.ts'
import { Permissions, hasPermission } from '../../_shared/permissions.ts'

// Validation schemas
const inviteSchema = z.object({
  email: z.string().email(),
  company_role: z.enum(['owner', 'admin', 'member']).optional(),
  project_role: z.enum(['admin', 'editor', 'viewer']).optional(),
  project_id: z.string().uuid().optional(),
})

const updateMemberSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  is_suspended: z.boolean().optional(),
})

// Email sending function (placeholder - implement with your email service)
async function sendInvitationEmail(invitation: any, email: string): Promise<void> {
  // TODO: Implement email sending using Resend, SendGrid, or other email service
  // For now, log the invitation details
  console.log('Invitation email would be sent to:', email)
  console.log('Invitation token:', invitation.token)
  console.log('Accept URL:', `${Deno.env.get('PUBLIC_URL')}/accept-invitation?token=${invitation.token}`)
  
  // Example implementation with Resend (requires setup):
  // const resend = new Resend(Deno.env.get('RESEND_API_KEY'))
  // await resend.emails.send({
  //   from: 'TCP Agent Platform <noreply@yourdomain.com>',
  //   to: email,
  //   subject: 'You have been invited to join TCP Agent Platform',
  //   html: `
  //     <p>You have been invited to join the TCP Agent Platform.</p>
  //     <p>Click the link below to accept the invitation:</p>
  //     <a href="${Deno.env.get('PUBLIC_URL')}/accept-invitation?token=${invitation.token}">
  //       Accept Invitation
  //     </a>
  //     <p>This invitation will expire in 7 days.</p>
  //   `
  // })
}

export async function handleTeam(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const method = req.method
  
  // Routes:
  // GET /team - List team members and invitations
  // POST /team/invitations - Create invitation
  // DELETE /team/invitations/:id - Revoke invitation
  // PATCH /team/members/:id - Update member role or suspension
  // DELETE /team/members/:id - Remove member
  // POST /team/invitations/accept - Accept invitation
  // GET /team/join-requests - List join requests
  // PATCH /team/join-requests/:id - Approve/reject join request
  
  const supabase = ctx.supabase!
  const user = ctx.user!
  const companyId = ctx.tenant?.id
  
  if (!companyId) {
    throw new ApiError(403, 'Company context required')
  }
  
  // Handle different routes
  const resource = pathParts[2] // After /api-gateway/team/
  const resourceId = pathParts[3]
  
  // GET /team - List members and invitations
  if (method === 'GET' && !resource) {
    const { data: members, error: membersError } = await supabase
      .from('company_members')
      .select(`
        company_id,
        user_id,
        role,
        joined_at,
        user:user_profiles!inner (
          id,
          email,
          full_name,
          avatar_url,
          is_suspended
        )
      `)
      .eq('company_id', companyId)
      .order('joined_at', { ascending: true })
    
    if (membersError) {
      throw new ApiError(500, `Failed to fetch members: ${membersError.message}`)
    }
    
    const { data: invitations, error: invitationsError } = await supabase
      .from('invitations')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (invitationsError) {
      throw new ApiError(500, `Failed to fetch invitations: ${invitationsError.message}`)
    }
    
    // Email is now included from user_profiles
    const enrichedMembers = members?.map(member => ({
      ...member,
      email: member.user?.email || 'Unknown',
    }))
    
    return new Response(
      JSON.stringify({
        members: enrichedMembers || [],
        invitations: invitations || [],
        permissions: ctx.userPermissions || [],
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
  
  // Handle invitation routes
  if (resource === 'invitations') {
    // POST /team/invitations - Create invitation
    if (method === 'POST' && !resourceId) {
      // Check permission
      if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_INVITE)) {
        throw new AuthorizationError('Insufficient permissions to invite members')
      }
      
      const body = await req.json()
      const validatedData = inviteSchema.parse(body)
      
      // Check if email already exists in company
      const { data: existingUser } = await supabase.auth.admin.getUserByEmail(validatedData.email)
      if (existingUser?.user) {
        const { data: existingMember } = await supabase
          .from('company_members')
          .select('user_id')
          .eq('company_id', companyId)
          .eq('user_id', existingUser.user.id)
          .single()
        
        if (existingMember) {
          throw new ApiError(400, 'User is already a member of this company')
        }
      }
      
      // Create invitation
      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          company_id: companyId,
          inviter_id: user.id,
          invitee_email: validatedData.email,
          company_role: validatedData.company_role || 'member',
          project_role: validatedData.project_role,
          project_id: validatedData.project_id,
        })
        .select()
        .single()
      
      if (error) {
        if (error.code === '23505') {
          throw new ApiError(400, 'An invitation is already pending for this email')
        }
        throw new ApiError(500, `Failed to create invitation: ${error.message}`)
      }
      
      // Send invitation email
      await sendInvitationEmail(invitation, validatedData.email)
      
      return new Response(
        JSON.stringify({ invitation }),
        { 
          status: 201, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // DELETE /team/invitations/:id - Revoke invitation
    if (method === 'DELETE' && resourceId) {
      // Check permission
      if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_INVITE)) {
        throw new AuthorizationError('Insufficient permissions to revoke invitations')
      }
      
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', resourceId)
        .eq('company_id', companyId)
        .eq('status', 'pending')
      
      if (error) {
        throw new ApiError(500, `Failed to revoke invitation: ${error.message}`)
      }
      
      return new Response(null, { status: 204 })
    }
    
    // POST /team/invitations/accept - Accept invitation
    if (method === 'POST' && resourceId === 'accept') {
      const body = await req.json()
      const { token } = body
      
      if (!token) {
        throw new ApiError(400, 'Token is required')
      }
      
      // Additional rate limiting for invitation acceptance (prevent brute force)
      // This is in addition to the general rate limiting
      // TODO: Implement specific rate limiting for this endpoint
      
      const { data, error } = await supabase
        .rpc('accept_invitation', {
          p_token: token,
          p_user_id: user.id,
        })
      
      if (error) {
        throw new ApiError(500, `Failed to accept invitation: ${error.message}`)
      }
      
      if (!data.success) {
        throw new ApiError(400, data.error || 'Failed to accept invitation')
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          company_id: data.company_id,
          project_id: data.project_id,
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }
  }
  
  // Handle member routes
  if (resource === 'members' && resourceId) {
    // PATCH /team/members/:id - Update member
    if (method === 'PATCH') {
      const body = await req.json()
      const validatedData = updateMemberSchema.parse(body)
      
      // Check permissions based on what's being updated
      if (validatedData.role !== undefined) {
        if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_ROLE_CHANGE)) {
          throw new AuthorizationError('Insufficient permissions to change member roles')
        }
        // Prevent users from changing their own role
        if (resourceId === user.id) {
          throw new ApiError(400, 'Cannot change your own role')
        }
      }
      if (validatedData.is_suspended !== undefined) {
        if (!hasPermission(ctx.userPermissions || [], Permissions.USER_SUSPEND)) {
          throw new AuthorizationError('Insufficient permissions to suspend/unsuspend users')
        }
      }
      
      // Get current member
      const { data: currentMember } = await supabase
        .from('company_members')
        .select('role')
        .eq('user_id', resourceId)
        .eq('company_id', companyId)
        .single()
      
      if (!currentMember) {
        throw new ApiError(404, 'Member not found')
      }
      
      if (currentMember.role === 'owner') {
        throw new ApiError(400, 'Cannot modify owner')
      }
      
      // Update role if provided
      if (validatedData.role !== undefined) {
        const { error } = await supabase
          .from('company_members')
          .update({ role: validatedData.role })
          .eq('user_id', resourceId)
          .eq('company_id', companyId)
        
        if (error) {
          throw new ApiError(500, `Failed to update role: ${error.message}`)
        }
      }
      
      // Update suspension if provided
      if (validatedData.is_suspended !== undefined) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ is_suspended: validatedData.is_suspended })
          .eq('id', resourceId)
        
        if (error) {
          throw new ApiError(500, `Failed to update suspension: ${error.message}`)
        }
      }
      
      return new Response(null, { status: 204 })
    }
    
    // DELETE /team/members/:id - Remove member
    if (method === 'DELETE') {
      // Check permission
      if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_REMOVE)) {
        throw new AuthorizationError('Insufficient permissions to remove members')
      }
      
      // Cannot remove yourself
      if (resourceId === user.id) {
        throw new ApiError(400, 'Cannot remove yourself')
      }
      
      // Get member role
      const { data: member } = await supabase
        .from('company_members')
        .select('role')
        .eq('user_id', resourceId)
        .eq('company_id', companyId)
        .single()
      
      if (!member) {
        throw new ApiError(404, 'Member not found')
      }
      
      if (member.role === 'owner') {
        throw new ApiError(400, 'Cannot remove owner')
      }
      
      // Remove from company
      const { error } = await supabase
        .from('company_members')
        .delete()
        .eq('user_id', resourceId)
        .eq('company_id', companyId)
      
      if (error) {
        throw new ApiError(500, `Failed to remove member: ${error.message}`)
      }
      
      // Remove from all company projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('company_id', companyId)
      
      if (projects && projects.length > 0) {
        await supabase
          .from('project_members')
          .delete()
          .eq('user_id', resourceId)
          .in('project_id', projects.map(p => p.id))
      }
      
      return new Response(null, { status: 204 })
    }
  }
  
  // Handle join request routes
  if (resource === 'join-requests') {
    // GET /team/join-requests - List join requests
    if (method === 'GET' && !resourceId) {
      // Check permission
      if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_MANAGE)) {
        throw new AuthorizationError('Insufficient permissions to view join requests')
      }
      
      const { data: joinRequests, error } = await supabase
        .from('company_join_requests')
        .select(`
          id,
          user_id,
          email,
          full_name,
          message,
          status,
          created_at,
          reviewed_at,
          reviewed_by,
          reviewer_notes,
          user:user_profiles (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      
      if (error) {
        throw new ApiError(500, `Failed to fetch join requests: ${error.message}`)
      }
      
      return new Response(
        JSON.stringify({ join_requests: joinRequests || [] }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // PATCH /team/join-requests/:id - Approve/reject join request
    if (method === 'PATCH' && resourceId) {
      // Check permission
      if (!hasPermission(ctx.userPermissions || [], Permissions.MEMBERS_MANAGE)) {
        throw new AuthorizationError('Insufficient permissions to review join requests')
      }
      
      const body = await req.json()
      const { action, notes } = body
      
      if (!action || !['approve', 'reject'].includes(action)) {
        throw new ApiError(400, 'Invalid action. Must be approve or reject')
      }
      
      // Review the join request
      const { data, error } = await supabase
        .rpc('review_company_join_request', {
          p_request_id: resourceId,
          p_reviewer_id: user.id,
          p_action: action,
          p_notes: notes
        })
      
      if (error) {
        throw new ApiError(500, `Failed to review join request: ${error.message}`)
      }
      
      // Log the security-sensitive action
      await supabase.rpc('log_audit_event', {
        p_event_type: 'company.join_request_reviewed',
        p_event_category: 'security',
        p_severity: 'medium',
        p_actor_type: 'user',
        p_actor_id: user.id,
        p_action: `${action}_join_request`,
        p_result: 'success',
        p_metadata: {
          request_id: resourceId,
          action: action,
          notes: notes
        },
        p_company_id: companyId,
        p_resource_type: 'company_join_request',
        p_resource_id: resourceId
      })
      
      return new Response(
        JSON.stringify({ success: true, action }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }
  }
  
  return new Response(
    JSON.stringify({ error: 'Not found' }),
    { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}