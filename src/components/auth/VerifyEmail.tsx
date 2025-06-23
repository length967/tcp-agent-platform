import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

export function VerifyEmail() {
  return (
    <div className="w-full max-w-md space-y-8 text-center">
      <div className="flex justify-center">
        <CheckCircle className="h-16 w-16 text-green-500" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We've sent you a verification link. Please check your email to complete your registration.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <p className="text-sm text-muted-foreground">
          Didn't receive an email? Check your spam folder or try again.
        </p>
        
        <Link to="/auth/login">
          <Button variant="outline" className="w-full">
            Back to login
          </Button>
        </Link>
      </div>
    </div>
  )
}