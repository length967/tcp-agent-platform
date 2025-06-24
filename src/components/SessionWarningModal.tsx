import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Clock, AlertTriangle } from 'lucide-react'
import { tokenRefreshManager } from '@/lib/auth-interceptor'
import { supabase } from '@/lib/supabase'

interface SessionWarningModalProps {
  timeRemaining: number // in seconds
  onExtend: () => void
  onDismiss: () => void
}

export function SessionWarningModal({ 
  timeRemaining: initialTime, 
  onExtend, 
  onDismiss 
}: SessionWarningModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime)
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleExtend = () => {
    setIsOpen(false)
    onExtend()
  }

  const handleDismiss = () => {
    setIsOpen(false)
    onDismiss()
  }

  const sessionConfig = tokenRefreshManager.getSessionConfig()
  const isCompanyEnforced = sessionConfig.isCompanyEnforced

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <AlertDialogTitle className="text-xl">Session Expiring Soon</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 pt-4">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Time remaining:</p>
                <div className="flex items-center gap-2 text-3xl font-bold text-amber-600 dark:text-amber-400">
                  <Clock className="h-8 w-8" />
                  {formatTime(timeRemaining)}
                </div>
              </div>
            </div>
            
            <p className="text-center">
              Your session is about to expire due to inactivity. 
              {isCompanyEnforced ? (
                <span className="block mt-1 text-xs">
                  Session timeout is enforced by your company's security policy.
                </span>
              ) : (
                <span className="block mt-1 text-xs">
                  You'll be logged out when the timer reaches zero.
                </span>
              )}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDismiss}>
            Log Out Now
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleExtend}>
            Extend Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Hook to manage session warning display
export function useSessionWarning() {
  const [showWarning, setShowWarning] = useState(false)
  const [warningTime, setWarningTime] = useState(300) // 5 minutes default

  const handleExtend = async () => {
    // Make a simple authenticated API call to refresh the session
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/session/config`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
      
      // Refresh session config
      await tokenRefreshManager.refreshConfig()
      
      setShowWarning(false)
    } catch (error) {
      console.error('Failed to extend session:', error)
    }
  }

  const handleDismiss = () => {
    setShowWarning(false)
    // User chose to log out, so trigger logout
    tokenRefreshManager.forceTimeout()
  }

  // Set up warning trigger
  useEffect(() => {
    const checkForWarning = () => {
      const config = tokenRefreshManager.getSessionConfig()
      const lastActivity = config.lastActivity || Date.now()
      const timeoutMs = config.timeoutMinutes * 60 * 1000
      const warningThresholdMs = 5 * 60 * 1000 // 5 minutes before timeout
      
      const timeSinceActivity = Date.now() - lastActivity
      const timeUntilTimeout = timeoutMs - timeSinceActivity
      
      if (timeUntilTimeout <= warningThresholdMs && timeUntilTimeout > 0 && !showWarning) {
        setWarningTime(Math.floor(timeUntilTimeout / 1000))
        setShowWarning(true)
      }
    }

    // Check every 30 seconds
    const interval = setInterval(checkForWarning, 30000)
    
    // Initial check
    checkForWarning()

    return () => clearInterval(interval)
  }, [showWarning])

  return {
    showWarning,
    warningTime,
    handleExtend,
    handleDismiss,
  }
}