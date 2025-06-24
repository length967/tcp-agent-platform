import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { LoginForm } from '@/components/auth/LoginForm'
import { SignupForm } from '@/components/auth/SignupForm'
import { VerifyEmail } from '@/components/auth/VerifyEmail'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { SessionWarningModal, useSessionWarning } from '@/components/SessionWarningModal'
import DashboardHome from '@/pages/dashboard/DashboardHome'
import Projects from '@/pages/dashboard/Projects'
import ProjectDetails from '@/pages/dashboard/ProjectDetails'
import Agents from '@/pages/dashboard/Agents'
import Transfers from '@/pages/dashboard/Transfers'
import Team from '@/pages/dashboard/Team'
import Company from '@/pages/dashboard/Company'
import Settings from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent() {
  const { showWarning, warningTime, handleExtend, handleDismiss } = useSessionWarning()
  
  return (
    <>
      <Routes>
              {/* Auth routes */}
              <Route path="/auth" element={<AuthLayout />}>
                <Route path="login" element={<LoginForm />} />
                <Route path="signup" element={<SignupForm />} />
                <Route path="verify-email" element={<VerifyEmail />} />
                <Route index element={<Navigate to="/auth/login" replace />} />
              </Route>

              {/* Protected Dashboard routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardLayout />}>
                  <Route index element={<DashboardHome />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="projects/:projectId" element={<ProjectDetails />} />
                  <Route path="agents" element={<Agents />} />
                  <Route path="transfers" element={<Transfers />} />
                  <Route path="team" element={<Team />} />
                  <Route path="company" element={<Company />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Route>

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      {showWarning && (
        <SessionWarningModal
          timeRemaining={warningTime}
          onExtend={handleExtend}
          onDismiss={handleDismiss}
        />
      )}
    </>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="tcp-agent-theme">
      <QueryClientProvider client={queryClient}>
        <Router>
          <AuthProvider>
            <ProjectProvider>
              <AppContent />
            </ProjectProvider>
          </AuthProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App