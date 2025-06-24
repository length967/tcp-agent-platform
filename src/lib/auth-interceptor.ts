import { supabase } from './supabase'
import { SecureStorage } from './secure-storage'

interface SessionConfig {
  timeoutMinutes: number
  lastActivity?: number
}

/**
 * Token refresh manager to handle automatic token refresh and session timeout
 */
class TokenRefreshManager {
  private refreshTimer: NodeJS.Timeout | null = null
  private refreshPromise: Promise<void> | null = null
  private activityTimer: NodeJS.Timeout | null = null
  private sessionConfig: SessionConfig = { timeoutMinutes: 30 }
  
  /**
   * Start monitoring session and schedule refresh
   */
  async startMonitoring() {
    // Clear any existing timer
    this.stopMonitoring()
    
    const session = await this.getSession()
    if (!session) return
    
    // Load session config
    await this.loadSessionConfig()
    
    // Calculate when to refresh (5 minutes before expiry)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    const now = Date.now()
    const refreshIn = Math.max(0, expiresAt - now - 5 * 60 * 1000)
    
    if (refreshIn > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken()
      }, refreshIn)
    } else {
      // Token is already expired or about to expire
      await this.refreshToken()
    }
    
    // Start activity monitoring
    this.startActivityMonitoring()
  }
  
  /**
   * Stop monitoring and clear timers
   */
  stopMonitoring() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
  }
  
  /**
   * Get current session
   */
  private async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }
  
  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<void> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise
    }
    
    this.refreshPromise = this._doRefresh()
    
    try {
      await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }
  
  private async _doRefresh(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) {
        console.error('Token refresh failed:', error)
        // If refresh fails, sign out the user
        await supabase.auth.signOut()
        window.location.href = '/auth/login'
        return
      }
      
      if (data.session) {
        // Schedule next refresh
        this.startMonitoring()
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    }
  }
  
  /**
   * Check if token needs refresh before making a request
   */
  async ensureValidToken(): Promise<boolean> {
    const session = await this.getSession()
    if (!session) return false
    
    // Check session timeout
    if (this.isSessionTimedOut()) {
      await supabase.auth.signOut()
      window.location.href = '/auth/login?reason=timeout'
      return false
    }
    
    // Update last activity
    this.updateActivity()
    
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    const now = Date.now()
    
    // If token expires in less than 1 minute, refresh it
    if (expiresAt - now < 60 * 1000) {
      await this.refreshToken()
      return true
    }
    
    return true
  }
  
  /**
   * Load session configuration from user settings
   */
  private async loadSessionConfig() {
    try {
      // Get user session timeout from database
      const { data, error } = await supabase
        .rpc('get_user_session_timeout', { user_id: (await this.getSession())?.user?.id })
      
      if (!error && data) {
        this.sessionConfig.timeoutMinutes = data
      }
      
      // Load last activity from storage
      const lastActivity = SecureStorage.getItem('lastActivity')
      if (lastActivity) {
        this.sessionConfig.lastActivity = parseInt(lastActivity, 10)
      } else {
        this.updateActivity()
      }
    } catch (error) {
      console.warn('Failed to load session config:', error)
    }
  }
  
  /**
   * Start monitoring user activity
   */
  private startActivityMonitoring() {
    // Clear existing timer
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }
    
    // Check for timeout every minute
    this.activityTimer = setInterval(() => {
      if (this.isSessionTimedOut()) {
        this.handleSessionTimeout()
      }
    }, 60 * 1000)
    
    // Listen for user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    const updateActivity = () => this.updateActivity()
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true })
    })
    
    // Store cleanup function
    (this as any).cleanupActivity = () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity)
      })
    }
  }
  
  /**
   * Update last activity timestamp
   */
  private updateActivity() {
    const now = Date.now()
    this.sessionConfig.lastActivity = now
    SecureStorage.setItem('lastActivity', now.toString())
  }
  
  /**
   * Check if session has timed out
   */
  private isSessionTimedOut(): boolean {
    if (!this.sessionConfig.lastActivity) return false
    
    const now = Date.now()
    const timeSinceActivity = now - this.sessionConfig.lastActivity
    const timeoutMs = this.sessionConfig.timeoutMinutes * 60 * 1000
    
    return timeSinceActivity > timeoutMs
  }
  
  /**
   * Handle session timeout
   */
  private async handleSessionTimeout() {
    this.stopMonitoring()
    if ((this as any).cleanupActivity) {
      (this as any).cleanupActivity()
    }
    
    await supabase.auth.signOut()
    SecureStorage.clearSensitiveData()
    window.location.href = '/auth/login?reason=timeout'
  }
}

// Create singleton instance
export const tokenRefreshManager = new TokenRefreshManager()

// Setup auth state change listener
supabase.auth.onAuthStateChange((event, session) => {
  switch (event) {
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
      tokenRefreshManager.startMonitoring()
      break
    
    case 'SIGNED_OUT':
      tokenRefreshManager.stopMonitoring()
      break
    
    case 'USER_UPDATED':
      // Re-check session on user update
      tokenRefreshManager.startMonitoring()
      break
  }
})

/**
 * Create an intercepted fetch that handles token refresh
 */
export function createAuthenticatedFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Ensure we have a valid token before making the request
    await tokenRefreshManager.ensureValidToken()
    
    // Make the original request
    const response = await originalFetch(input, init)
    
    // If we get a 401, try to refresh and retry once
    if (response.status === 401) {
      const retryAfterRefresh = await tokenRefreshManager.refreshToken()
        .then(() => true)
        .catch(() => false)
      
      if (retryAfterRefresh) {
        // Get new session and retry
        const { data: { session } } = await supabase.auth.getSession()
        if (session && init?.headers) {
          // Update authorization header
          const headers = new Headers(init.headers)
          headers.set('Authorization', `Bearer ${session.access_token}`)
          
          return originalFetch(input, {
            ...init,
            headers,
          })
        }
      }
    }
    
    return response
  }
}