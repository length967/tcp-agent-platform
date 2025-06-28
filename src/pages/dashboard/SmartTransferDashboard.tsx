import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TransferPerformancePrediction from '@/components/dashboard/TransferPerformancePrediction'
import OptimizationRecommendations from '@/components/dashboard/OptimizationRecommendations'
import SmartQueueManagement from '@/components/dashboard/SmartQueueManagement'

export default function SmartTransferDashboard() {
  return (
    <div className="flex flex-col h-full">
      <h1 className="text-2xl font-bold mb-4">Smart Transfer Dashboard</h1>
      <Tabs defaultValue="performance" className="flex-grow">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="queue">Smart Queue</TabsTrigger>
        </TabsList>
        <TabsContent value="performance" className="h-full">
          <TransferPerformancePrediction />
        </TabsContent>
        <TabsContent value="optimization" className="h-full">
          <OptimizationRecommendations />
        </TabsContent>
        <TabsContent value="queue" className="h-full">
          <SmartQueueManagement />
        </TabsContent>
      </Tabs>
    </div>
  )
}

