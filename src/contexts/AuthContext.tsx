import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { SecureStorage } from '@/lib/secure-storage'

interface AuthContextValue {
  session: Session | null
  user: User | null
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        
        // Handle auth events
        if (event === 'SIGNED_OUT') {
          // Clear any cached data
          SecureStorage.clearSensitiveData()
          navigate('/auth/login')
        } else if (event === 'SIGNED_IN' && window.location.pathname.startsWith('/auth')) {
          // Redirect to dashboard after sign in if still on auth page
          navigate('/dashboard')
        } else if (event === 'TOKEN_REFRESHED') {
          // Token was refreshed successfully
          console.log('Token refreshed')
        } else if (event === 'USER_UPDATED') {
          // User data was updated
          setUser(session?.user ?? null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [navigate])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}