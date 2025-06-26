import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '@/components/theme-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'
import { AIInsightsSidebar } from '@/components/ui/ai-insights-sidebar'
import { useAuth } from '@/contexts/AuthContext'
import {
  Activity,
  Home,
  Server,
  BarChart3,
  Users,
  Building2,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
  Bell,
  Folder,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Projects', href: '/dashboard/projects', icon: Folder },
  { name: 'Agents', href: '/dashboard/agents', icon: Server },
  { name: 'Transfers', href: '/dashboard/transfers', icon: BarChart3 },
  { name: 'Team', href: '/dashboard/team', icon: Users },
  { name: 'Company', href: '/dashboard/company', icon: Building2 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()

  const currentPage = navigation.find(item => 
    location.pathname === item.href || 
    (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
  ) || navigation[0]

  return (
    <div className="flex font-sans antialiased text-zinc-900 bg-zinc-50 dark:text-zinc-100 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className={`${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 min-h-screen flex flex-col justify-between border-r border-zinc-200 bg-white/60 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/60 transition-transform duration-300 ease-in-out`}>
        <div>
          <div className="flex items-center gap-2 px-6 py-5">
            <Activity className="h-6 w-6 text-indigo-500" />
            <span className="text-xl font-semibold tracking-tight">TCP Agent</span>
          </div>

          <nav className="mt-4 space-y-1 px-4" aria-label="Main">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
          
          {/* AI Insights Sidebar */}
          <div className="mt-6 flex-1">
            <AIInsightsSidebar />
          </div>
        </div>

        <div className="px-6 py-5 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.user_metadata?.avatar_url} />
            <AvatarFallback>
              {user?.email?.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <button
              onClick={signOut}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center gap-1 mt-1"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-zinc-200 bg-white/60 backdrop-blur-xl dark:bg-transparent dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold tracking-tight">{currentPage.name}</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ProjectSwitcher />
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label="Theme toggle"
              className="relative"
            >
              <Sun className="w-5 h-5 hidden dark:inline" />
              <Moon className="w-5 h-5 dark:hidden" />
            </button>
            
            <button className="relative" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}