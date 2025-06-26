import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SubscriptionUpgradePromptProps {
  feature: string
  currentPlan?: string
  requiredPlan?: string
  onUpgrade?: () => void
  className?: string
}

export function SubscriptionUpgradePrompt({
  feature,
  currentPlan = "Free",
  requiredPlan = "Pro",
  onUpgrade,
  className,
}: SubscriptionUpgradePromptProps) {
  return (
    <Card className={cn("w-full max-w-lg", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Upgrade Required</CardTitle>
          <Badge variant="secondary">{currentPlan}</Badge>
        </div>
        <CardDescription>
          {feature} is available on {requiredPlan} plans and above
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Upgrade to {requiredPlan} to unlock:
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{feature}</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Advanced analytics</span>
            </li>
            <li className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>Priority support</span>
            </li>
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={onUpgrade} className="w-full">
          Upgrade to {requiredPlan}
        </Button>
      </CardFooter>
    </Card>
  )
}

interface SubscriptionGateProps {
  isAllowed: boolean
  feature?: string
  currentPlan?: string
  requiredPlan?: string
  onUpgrade?: () => void
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function SubscriptionGate({
  isAllowed,
  feature = "This feature",
  currentPlan,
  requiredPlan,
  onUpgrade,
  children,
  fallback,
}: SubscriptionGateProps) {
  if (isAllowed) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return (
    <SubscriptionUpgradePrompt
      feature={feature}
      currentPlan={currentPlan}
      requiredPlan={requiredPlan}
      onUpgrade={onUpgrade}
    />
  )
}

interface FeatureLockedProps {
  feature: string
  className?: string
}

export function FeatureLocked({ feature, className }: FeatureLockedProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-dashed p-8",
        className
      )}
    >
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <X className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        <h3 className="font-semibold">{feature} is locked</h3>
        <p className="text-sm text-muted-foreground">
          Upgrade your plan to access this feature
        </p>
      </div>
    </div>
  )
}