import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary">TCP Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            High-performance file transfer platform
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}