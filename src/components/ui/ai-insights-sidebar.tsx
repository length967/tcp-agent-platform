import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Brain, 
  Lightbulb, 
  TrendingUp, 
  Zap, 
  Crown, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIInsight {
  type: 'optimization' | 'prediction' | 'queue'
  title: string
  description: string
  impact: string
  icon: React.ElementType
  color: string
}

const mockInsights: AIInsight[] = [
  {
    type: 'optimization',
    title: '3 optimization opportunities',
    description: 'Potential 25% speed improvement',
    impact: 'High',
    icon: Lightbulb,
    color: 'text-amber-500'
  },
  {
    type: 'prediction',
    title: 'Performance prediction',
    description: 'Next transfer: 2h 15m estimated',
    impact: 'Medium',
    icon: TrendingUp,
    color: 'text-green-500'
  },
  {
    type: 'queue',
    title: 'Smart queue active',
    description: '5 transfers optimally scheduled',
    impact: 'Medium',
    icon: Zap,
    color: 'text-blue-500'
  }
]

interface SubscriptionTier {
  id: 'free' | 'starter' | 'professional' | 'enterprise'
  name: string
}

export function AIInsightsSidebar() {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Get user's subscription tier
  const { data: subscription } = useQuery({
    queryKey: ['user-subscription'],
    queryFn: async () => {
      const response = await api.get('/api/user/subscription')
      return response.data as SubscriptionTier
    }
  })

  const isPremium = subscription?.id === 'professional' || subscription?.id === 'enterprise'
  const currentTier = subscription?.name || 'Free'

  if (isPremium) {
    return (
      <div className="mx-4 mb-4">
        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">
                  AI Insights
                </CardTitle>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs px-2 py-0">
                  {currentTier}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900"
              >
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {mockInsights.slice(0, isExpanded ? 3 : 2).map((insight, index) => (
                <div key={index} className="flex items-start gap-2">
                  <insight.icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", insight.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 leading-tight">
                      {insight.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                      {insight.description}
                    </p>
                  </div>
                </div>
              ))}
              
              {!isExpanded && mockInsights.length > 2 && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                >
                  +{mockInsights.length - 2} more insights
                </button>
              )}
            </div>
            
            <Button 
              size="sm" 
              className="w-full mt-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs h-8"
            >
              <Crown className="h-3 w-3 mr-1" />
              Explore Smart Features
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-4 mb-4">
      <Card className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-950/50 dark:to-blue-950/20 border-gray-200 dark:border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <CardTitle className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Upgrade Required
            </CardTitle>
            <Badge variant="outline" className="text-xs px-2 py-0">
              {currentTier}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-tight">
            Smart Transfer Intelligence is available on Pro plans and above
          </p>
          
          <div className="space-y-2 mb-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Upgrade to Pro to unlock:
            </p>
            <div className="space-y-1">
              {[
                'Smart Transfer Intelligence',
                'Advanced analytics',
                'Priority support'
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="h-1 w-1 bg-green-500 rounded-full flex-shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          <Button 
            size="sm" 
            className="w-full bg-gradient-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white text-xs h-8"
          >
            Upgrade to Pro
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
} 