import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
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
import { TimezoneProvider } from '@/contexts/TimezoneContext'
import { SessionWarningModal, useSessionWarning } from '@/components/SessionWarningModal'
import DashboardHome from '@/pages/dashboard/DashboardHome'
import Projects from '@/pages/dashboard/Projects'
import ProjectDetails from '@/pages/dashboard/ProjectDetails'
import Agents from '@/pages/dashboard/Agents'
import Transfers from '@/pages/dashboard/Transfers'
import Team from '@/pages/dashboard/Team'
import Company from '@/pages/dashboard/Company'
import Settings from '@/pages/Settings'
import SmartTransferDashboard from '@/pages/dashboard/SmartTransferDashboard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function RootLayout() {
  const { showWarning, warningTime, handleExtend, handleDismiss } = useSessionWarning()
  
  return (
    <>
      <Outlet />
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

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthProvider>
        <TimezoneProvider>
          <ProjectProvider>
            <RootLayout />
          </ProjectProvider>
        </TimezoneProvider>
      </AuthProvider>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'auth',
        element: <AuthLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/auth/login" replace />,
          },
          {
            path: 'login',
            element: <LoginForm />,
          },
          {
            path: 'signup',
            element: <SignupForm />,
          },
          {
            path: 'verify-email',
            element: <VerifyEmail />,
          },
        ],
      },
      {
        path: 'dashboard',
        element: <ProtectedRoute />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              {
                index: true,
                element: <DashboardHome />,
              },
              {
                path: 'projects',
                element: <Projects />,
              },
              {
                path: 'projects/:projectId',
                element: <ProjectDetails />,
              },
              {
                path: 'agents',
                element: <Agents />,
              },
              {
                path: 'transfers',
                element: <Transfers />,
              },
              {
                path: 'team',
                element: <Team />,
              },
              {
                path: 'company',
                element: <Company />,
              },
              {
                path: 'settings',
                element: <Settings />,
              },
              {
                path: 'smart-transfers',
                element: <SmartTransferDashboard />,
              },
            ],
          },
        ],
      },
    ],
  },
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
    v7_normalizeFormMethod: true,
    v7_fetcherPersist: true,
    v7_partialHydration: true,
    v7_prependBasename: true,
    v7_skipActionErrorRevalidation: true,
  },
})

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="tcp-agent-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App