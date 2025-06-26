import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { signUp } from '@/lib/supabase'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InvitationHandler } from './InvitationHandler'
import { CompanyDuplicateHandler } from './CompanyDuplicateHandler'

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type SignupFormData = z.infer<typeof signupSchema>

export function SignupForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null)
  const [showDuplicateHandler, setShowDuplicateHandler] = useState(false)
  const [attemptedCompanyName, setAttemptedCompanyName] = useState('')
  
  const invitationToken = searchParams.get('invitation')
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })
  
  const watchedEmail = watch('email')
  
  useEffect(() => {
    if (watchedEmail) {
      setEmail(watchedEmail)
    }
  }, [watchedEmail])

  const onSubmit = async (data: SignupFormData) => {
    try {
      setError(null)
      setLoading(true)
      
      const signupData: any = {
        email: data.email,
        password: data.password,
        fullName: data.fullName,
      }
      
      // Add invitation token if present
      if (invitationToken) {
        signupData.invitationToken = invitationToken
      } else if (selectedCompany) {
        // User selected to join existing company
        signupData.companyId = selectedCompany.id
      } else {
        // Check for duplicate companies before creating new one
        if (data.companyName) {
          try {
            const response = await api.auth.findSimilarCompanies({
              companyName: data.companyName,
              userEmail: data.email
            })
            
            if (response.companies && response.companies.length > 0) {
              // Found similar companies, show duplicate handler
              setAttemptedCompanyName(data.companyName)
              setShowDuplicateHandler(true)
              setLoading(false)
              return
            }
          } catch (duplicateError) {
            console.error('Error checking for duplicates:', duplicateError)
            // Continue with signup if duplicate check fails
          }
        }
        
        // Creating new company
        signupData.companyName = data.companyName
      }
      
      await signUp(signupData)
      
      // Redirect to email verification notice
      navigate('/auth/verify-email')
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }
  
  const handleCompanySelected = (companyId: string, companyName: string) => {
    setSelectedCompany({ id: companyId, name: companyName })
    setShowForm(true)
    // Pre-fill company name to prevent editing
    setValue('companyName', companyName)
  }
  
  const handleCreateNewCompany = () => {
    setSelectedCompany(null)
    setShowForm(true)
    // Clear company name so user can enter their own
    setValue('companyName', '')
  }
  
  const handleRequestJoinCompany = async (companyId: string, companyName: string, requiresApproval: boolean) => {
    try {
      setLoading(true)
      setError(null)
      
      const formData = watch()
      
      if (requiresApproval) {
        // Create join request first, then signup
        await api.auth.requestJoinCompany({ 
          companyId,
          message: `Requesting to join ${companyName} during account creation.`
        })
        
        // Signup without company (will be added when request is approved)
        const signupData: any = {
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          pendingCompanyJoinRequest: companyId
        }
        
        await signUp(signupData)
        navigate('/auth/verify-email?message=join-request-pending')
      } else {
        // Direct join (for domain matches)
        await api.auth.requestJoinCompany({ companyId })
        
        const signupData: any = {
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          companyId: companyId
        }
        
        await signUp(signupData)
        navigate('/auth/verify-email')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request company join')
      setLoading(false)
    }
  }
  
  const handleCreateNewCompanyConfirmed = async (confirmedName: string) => {
    try {
      setLoading(true)
      setError(null)
      
      const formData = watch()
      const signupData: any = {
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        companyName: confirmedName,
        forceCreateCompany: true // Flag to bypass duplicate check
      }
      
      await signUp(signupData)
      navigate('/auth/verify-email')
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
      setLoading(false)
    }
  }
  
  const handleBackFromDuplicates = () => {
    setShowDuplicateHandler(false)
    setAttemptedCompanyName('')
  }

  // Show invitation handler first if we have invitation or email but haven't shown form yet
  if (!showForm && (invitationToken || email)) {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Join TCP Agent Platform</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Let's get you set up with the right company
          </p>
        </div>
        
        <InvitationHandler
          email={email}
          invitationToken={invitationToken || undefined}
          onCompanySelected={handleCompanySelected}
          onCreateNewCompany={handleCreateNewCompany}
        />
        
        {!invitationToken && (
          <div className="text-center">
            <Button 
              variant="outline" 
              onClick={() => setShowForm(true)}
              className="w-full"
            >
              Continue with signup form
            </Button>
          </div>
        )}
      </div>
    )
  }
  
  // Show duplicate handler if we found similar companies
  if (showDuplicateHandler && attemptedCompanyName && email) {
    return (
      <div className="w-full max-w-2xl space-y-8">
        <CompanyDuplicateHandler
          attemptedCompanyName={attemptedCompanyName}
          userEmail={email}
          onRequestJoinCompany={handleRequestJoinCompany}
          onCreateNewCompany={handleCreateNewCompanyConfirmed}
          onBack={handleBackFromDuplicates}
        />
      </div>
    )
  }

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold">Create your account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedCompany 
            ? `Joining ${selectedCompany.name}` 
            : 'Start managing your TCP Agents today'
          }
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              {...register('fullName')}
              className="mt-1"
            />
            {errors.fullName && (
              <p className="mt-1 text-sm text-destructive">
                {errors.fullName.message}
              </p>
            )}
          </div>

          {!selectedCompany && (
            <div>
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                type="text"
                autoComplete="organization"
                {...register('companyName')}
                className="mt-1"
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-destructive">
                  {errors.companyName.message}
                </p>
              )}
            </div>
          )}
          
          {selectedCompany && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You'll be joining: <strong>{selectedCompany.name}</strong>
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="mt-1"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
              className="mt-1"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className="mt-1"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}