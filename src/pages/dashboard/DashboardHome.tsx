import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Server,
  FileText,
  Database,
  TrendingUp,
  ShieldCheck,
  CreditCard,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { useProjectRealtime } from '@/hooks/useRealtime'
import { useProject } from '@/contexts/ProjectContext'

// Metric card component
function MetricCard({
  title,
  icon: Icon,
  iconColor,
  value,
  subtext,
  status,
  link,
  chart,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  value: string | number
  subtext?: string
  status?: 'active' | 'warning' | 'error'
  link?: { text: string; href: string }
  chart?: { data: number[]; color: string }
}) {
  const statusColors = {
    active: 'bg-emerald-500',
    warning: 'bg-amber-400',
    error: 'bg-rose-500',
  }

  return (
    <Card className="bg-white/60 dark:bg-zinc-900/60 hover:ring-1 hover:ring-indigo-500/40 transition">
      <CardContent className="p-4 flex flex-col gap-4 min-h-[10.5rem]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 flex items-center justify-center rounded-lg",
              iconColor
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">{title}</span>
          </div>
          {status && (
            <span className={cn("h-2.5 w-2.5 rounded-full", statusColors[status])} />
          )}
        </div>
        <h3 className="text-3xl font-semibold tracking-tight">{value}</h3>
        {subtext && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtext}</p>}
        {link && (
          <a href={link.href} className="text-xs text-indigo-500 hover:underline mt-auto">
            {link.text}
          </a>
        )}
        {chart && (
          <div className="relative w-full h-20 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.data.map((v, i) => ({ value: v, index: i }))}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={chart.color}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardHome() {
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch dashboard data
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const data = await api.agents.list()
      return data.agents
    },
    refetchInterval: 30000, // Refresh every 30s
  })

  const { data: transfers } = useQuery({
    queryKey: ['recentTransfers'],
    queryFn: async () => {
      const data = await api.transfers.list()
      return data.transfers
    },
    refetchInterval: 30000,
  })

  // Get current project from context
  const { currentProject } = useProject()
  const currentProjectId = currentProject?.id

  // Enable real-time updates for this project
  useProjectRealtime(currentProjectId)


  // Calculate metrics
  const activeAgents = agents?.filter(a => 
    a.last_seen_at && new Date(a.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000
  ).length || 0
  const totalAgents = agents?.length || 0

  const recentTransfers = transfers?.slice(0, 10) || []
  const successfulTransfers = transfers?.filter(t => t.status === 'completed').length || 0
  const totalTransfers = transfers?.length || 0
  const successRate = totalTransfers > 0 ? ((successfulTransfers / totalTransfers) * 100).toFixed(1) : '0'

  // Calculate data volume from completed transfers
  const totalDataVolume = transfers?.reduce((sum, transfer) => {
    if (transfer.status === 'completed' && transfer.transfer_files) {
      return sum + transfer.transfer_files.reduce((fileSum: number, file: any) => fileSum + (file.file_size || 0), 0)
    }
    return sum
  }, 0) || 0

  // Mock data for charts and other metrics
  const performanceData = [91, 93, 95, 92, 96, 97, 98.1]

  // Helper function to format file sizes
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
  }

  return (
    <div className="px-4 py-6 lg:px-8 space-y-10">
      {/* Greeting */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-700">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">
            Welcome back to TCP Agent Platform
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {format(currentTime, 'EEEE, MMMM d, yyyy • h:mm a')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">All systems healthy</span>
        </div>
      </section>

      {/* Key Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-100">
        <MetricCard
          title="Active Agents"
          icon={Server}
          iconColor="bg-indigo-600/10 text-indigo-500"
          value={activeAgents}
          subtext={`of ${totalAgents} total`}
          status="active"
          link={{ text: "View all agents", href: "/dashboard/agents" }}
        />
        
        <MetricCard
          title="Transfer Activity"
          icon={FileText}
          iconColor="bg-green-600/10 text-green-500"
          value={totalTransfers.toLocaleString()}
          subtext={`Success rate ${successRate}%`}
        />
        
        <MetricCard
          title="Data Volume"
          icon={Database}
          iconColor="bg-purple-600/10 text-purple-500"
          value={formatFileSize(totalDataVolume)}
          subtext="All time"
        />
        
        <MetricCard
          title="Performance"
          icon={TrendingUp}
          iconColor="bg-orange-600/10 text-orange-500"
          value="98.1%"
          subtext="Last 30 days"
          chart={{ data: performanceData, color: "#f97316" }}
        />
        
        <MetricCard
          title="SLA Compliance"
          icon={ShieldCheck}
          iconColor="bg-yellow-600/10 text-yellow-500"
          value="99.8%"
          subtext="This quarter"
        />
        
        <MetricCard
          title="Monthly Spend"
          icon={CreditCard}
          iconColor="bg-sky-600/10 text-sky-500"
          value="$12.4k"
          subtext="Budget usage 68%"
        />
      </section>

      {/* Dense Info Grid */}
      <section className="grid lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-200">
        {/* Recent Transfers */}
        <Card className="lg:col-span-2 bg-white/60 dark:bg-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transfers</CardTitle>
            <a href="/dashboard/transfers" className="text-xs text-indigo-500 hover:underline">
              View all
            </a>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100/60 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">ID</th>
                    <th className="px-4 py-2 text-left font-medium">File</th>
                    <th className="px-4 py-2 text-left font-medium">Size</th>
                    <th className="px-4 py-2 text-left font-medium">Agent</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransfers.map((transfer, index) => (
                    <tr
                      key={transfer.id}
                      className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/40 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-4 py-2">#{(totalTransfers - index).toString().padStart(4, '0')}</td>
                      <td className="px-4 py-2">{transfer.name}</td>
                      <td className="px-4 py-2">1.2 GB</td>
                      <td className="px-4 py-2">
                        {agents?.find(a => a.id === transfer.source_agent_id)?.name || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            transfer.status === 'completed' ? 'success' :
                            transfer.status === 'failed' ? 'destructive' :
                            transfer.status === 'in_progress' ? 'warning' :
                            'secondary'
                          }
                        >
                          {transfer.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {transfer.created_at ? format(new Date(transfer.created_at), 'HH:mm') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agents Health */}
        <Card className="bg-white/60 dark:bg-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Agents Health</CardTitle>
            <a href="/dashboard/agents" className="text-xs text-indigo-500 hover:underline">
              Manage
            </a>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {agents?.slice(0, 5).map((agent) => {
                const isOnline = agent.last_seen_at && 
                  new Date(agent.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000
                const statusColor = isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                const load = isOnline ? Math.floor(Math.random() * 80) : 0
                
                return (
                  <li
                    key={agent.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-zinc-100/40 dark:hover:bg-zinc-800/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", statusColor)} />
                      <span className="text-sm">{agent.name}</span>
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {isOnline ? `Load ${load}%` : 'Offline'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Activity & Announcements */}
      <section className="grid lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-300">
        {/* Timeline */}
        <Card className="lg:col-span-2 bg-white/60 dark:bg-zinc-900/60">
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="h-2.5 w-2.5 mt-2 rounded-full bg-indigo-500"></span>
                <div>
                  <p className="text-sm">
                    <strong className="font-medium">NYC-3</strong> completed incremental backup.
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDistanceToNow(new Date(Date.now() - 2 * 60 * 60 * 1000), { addSuffix: true })}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-2.5 w-2.5 mt-2 rounded-full bg-rose-500"></span>
                <div>
                  <p className="text-sm">
                    <strong className="font-medium">SEA-1</strong> failed to connect to LON-5.
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDistanceToNow(new Date(Date.now() - 3 * 60 * 60 * 1000), { addSuffix: true })}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-2.5 w-2.5 mt-2 rounded-full bg-emerald-500"></span>
                <div>
                  <p className="text-sm">
                    New agent <strong className="font-medium">LAX-7</strong> joined the cluster.
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDistanceToNow(new Date(Date.now() - 24 * 60 * 60 * 1000), { addSuffix: true })}
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card className="bg-white/60 dark:bg-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Announcements</CardTitle>
            <button className="text-xs text-indigo-500 hover:underline">Archive</button>
          </CardHeader>
          <CardContent className="space-y-6">
            <article className="relative pl-3">
              <span className="absolute left-0 top-0 h-full w-0.5 bg-indigo-500/60"></span>
              <h4 className="font-medium">Maintenance window</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Scheduled on 18 July, 01:00-03:00 UTC.
              </p>
            </article>
            <article className="relative pl-3">
              <span className="absolute left-0 top-0 h-full w-0.5 bg-indigo-500/60"></span>
              <h4 className="font-medium">Agent v2.7 released</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Improved transfer throughput and bug fixes.
              </p>
            </article>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}