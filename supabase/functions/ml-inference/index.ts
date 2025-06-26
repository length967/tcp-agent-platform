import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface MLInferenceRequest {
  model: 'performance' | 'anomaly' | 'scheduling' | 'resource'
  features: Record<string, any>
  transferId?: string
  agentId?: string
      options?: {
      confidence_threshold?: number
      return_explanation?: boolean
    }
}

interface MLInferenceResponse {
  prediction: any
  confidence: number
  model_version: string
  timestamp: string
  explanation?: string
  cached?: boolean
}

// In-memory cache for predictions (in production, use Redis)
const predictionCache = new Map<string, { prediction: any, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { model, features, transferId, agentId, options } = await req.json() as MLInferenceRequest

    // Validate request
    if (!model || !features) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: model and features'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check cache first
    const cacheKey = `${model}:${JSON.stringify(features)}`
    const cached = predictionCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(JSON.stringify({
        ...cached.prediction,
        cached: true,
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Run inference based on model type
    let prediction: any
    let confidence: number
    let explanation: string | undefined

    switch (model) {
      case 'performance':
        ({ prediction, confidence, explanation } = await predictPerformance(features, options))
        break
      case 'anomaly':
        ({ prediction, confidence, explanation } = await detectAnomaly(features, options))
        break
      case 'scheduling':
        ({ prediction, confidence, explanation } = await optimizeScheduling(features, options))
        break
      case 'resource':
        ({ prediction, confidence, explanation } = await allocateResources(features, options))
        break
      default:
        return new Response(JSON.stringify({
          error: `Unknown model type: ${model}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    const response: MLInferenceResponse = {
      prediction,
      confidence,
      model_version: '1.0.0',
      timestamp: new Date().toISOString(),
      cached: false
    }

    if (options?.return_explanation && explanation) {
      response.explanation = explanation
    }

    // Cache the prediction
    predictionCache.set(cacheKey, {
      prediction: response,
      timestamp: Date.now()
    })

    // Store prediction for tracking (if IDs provided)
    if (transferId || agentId) {
      await storePrediction(supabase, model, response, transferId, agentId)
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('ML Inference error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})


async function predictPerformance(features: Record<string, any>, options?: any) {
  // Simplified performance prediction (would use actual ML model in production)
  const bandwidth = features.bandwidth_utilization || 50
  const latency = features.latency_ms || 50
  const packetLoss = features.packet_loss_rate || 0.01
  const cpuUsage = features.cpu_usage || 50

  // Simple heuristic model
  const networkScore = (100 - bandwidth) * 0.3 + (100 - Math.min(latency / 2, 100)) * 0.3 + (1 - packetLoss * 100) * 0.4
  const systemScore = (100 - cpuUsage) * 0.6 + (100 - (features.memory_usage || 60)) * 0.4
  
  const overallScore = (networkScore + systemScore) / 2
  
  // Predict throughput based on score
  const baseThroughput = features.connection_bandwidth || 100
  const predictedThroughput = baseThroughput * (overallScore / 100) * 0.8

  // Predict completion time (simplified)
  const fileSize = features.file_size_gb || 1
  const predictedCompletionTime = (fileSize * 8 * 1024) / (predictedThroughput + 1) / 60 // minutes

  const prediction = {
    predicted_throughput_mbps: Math.round(predictedThroughput * 100) / 100,
    predicted_completion_minutes: Math.round(predictedCompletionTime * 100) / 100,
    network_score: Math.round(networkScore * 100) / 100,
    system_score: Math.round(systemScore * 100) / 100
  }

  const confidence = Math.min(overallScore / 100, 0.95)

  const explanation = `Based on ${bandwidth}% bandwidth utilization, ${latency}ms latency, ` +
    `${(packetLoss * 100).toFixed(2)}% packet loss, and ${cpuUsage}% CPU usage. ` +
    `Network conditions are ${networkScore > 70 ? 'good' : networkScore > 40 ? 'fair' : 'poor'}.`

  return { prediction, confidence, explanation }
}

async function detectAnomaly(features: Record<string, any>, options?: any) {
  // Simplified anomaly detection
  const bandwidth = features.bandwidth_utilization || 50
  const latency = features.latency_ms || 50
  const packetLoss = features.packet_loss_rate || 0.01
  const throughput = features.throughput_mbps || 100

  // Check for anomalies using simple thresholds
  const anomalies = []
  let anomalyScore = 0

  if (bandwidth > 95) {
    anomalies.push('high_bandwidth_utilization')
    anomalyScore += 0.3
  }

  if (latency > 200) {
    anomalies.push('high_latency')
    anomalyScore += 0.4
  }

  if (packetLoss > 0.05) {
    anomalies.push('high_packet_loss')
    anomalyScore += 0.5
  }

  if (throughput < 10) {
    anomalies.push('low_throughput')
    anomalyScore += 0.3
  }

  const isAnomaly = anomalyScore > 0.3
  const confidence = Math.min(anomalyScore + 0.5, 0.95)

  const prediction = {
    is_anomaly: isAnomaly,
    anomaly_score: Math.round(anomalyScore * 1000) / 1000,
    anomaly_types: anomalies,
    severity: anomalyScore > 0.7 ? 'high' : anomalyScore > 0.4 ? 'medium' : 'low'
  }

  const explanation = isAnomaly 
    ? `Anomaly detected: ${anomalies.join(', ')}. Score: ${anomalyScore.toFixed(3)}`
    : 'No anomalies detected. All metrics within normal ranges.'

  return { prediction, confidence, explanation }
}

async function optimizeScheduling(features: Record<string, any>, options?: any) {
  // Simplified scheduling optimization
  const currentHour = new Date().getHours()
  const priority = features.priority || 'medium'
  const networkCongestion = features.network_congestion || 50
  const systemLoad = features.system_load || 50

  let recommendedDelay = 0
  let reasoning = ''

  if (priority === 'critical') {
    recommendedDelay = 0
    reasoning = 'Immediate scheduling for critical transfer'
  } else if (priority === 'low') {
    // Prefer off-peak hours
    if (currentHour >= 9 && currentHour <= 17) {
      recommendedDelay = Math.random() * 6 + 6 // 6-12 hours (evening/night)
      reasoning = 'Scheduled for off-peak hours to optimize resource usage'
    } else {
      recommendedDelay = 0
      reasoning = 'Immediate scheduling during off-peak hours'
    }
  } else {
    // Medium priority - consider system conditions
    if (networkCongestion > 80 || systemLoad > 80) {
      recommendedDelay = Math.random() * 3 + 1 // 1-4 hours
      reasoning = 'Short delay due to high system load or network congestion'
    } else {
      recommendedDelay = 0
      reasoning = 'Immediate scheduling - system conditions are favorable'
    }
  }

  const scheduledTime = new Date(Date.now() + recommendedDelay * 60 * 60 * 1000)
  
  const prediction = {
    recommended_delay_hours: Math.round(recommendedDelay * 100) / 100,
    scheduled_time: scheduledTime.toISOString(),
    scheduled_hour: scheduledTime.getHours(),
    priority_considered: priority,
    reasoning
  }

  const confidence = 0.8

  return { prediction, confidence, explanation: reasoning }
}

async function allocateResources(features: Record<string, any>, options?: any) {
  // Simplified resource allocation
  const agents = features.agents || []
  const totalBandwidth = features.total_bandwidth_mbps || 1000
  const priorityWeights = { high: 2.0, medium: 1.0, low: 0.5 }

  const allocations = agents.map((agent: any, index: number) => {
    const priority = agent.priority || 'medium'
    const demand = agent.bandwidth_demand || 100
    const weight = priorityWeights[priority as keyof typeof priorityWeights] || 1.0

    // Simple weighted allocation
    const allocationRatio = weight / agents.length
    const bandwidthAllocation = Math.min(allocationRatio * totalBandwidth, demand)

    return {
      agent_id: agent.id || index,
      bandwidth_mbps: Math.round(bandwidthAllocation * 100) / 100,
      cpu_cores: Math.round((agent.cpu_demand || 2) * (bandwidthAllocation / demand) * 100) / 100,
      memory_gb: Math.round((agent.memory_demand || 4) * (bandwidthAllocation / demand) * 100) / 100,
      priority: priority,
      utilization_ratio: Math.round((bandwidthAllocation / demand) * 100) / 100
    }
  })

  const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.bandwidth_mbps, 0)
  const utilization = totalAllocated / totalBandwidth

  const prediction = {
    allocations,
    total_bandwidth_allocated: Math.round(totalAllocated * 100) / 100,
    bandwidth_utilization: Math.round(utilization * 100) / 100,
    fairness_score: calculateFairnessScore(allocations),
    efficiency_score: Math.min(utilization / 0.85, 1.0) // Target 85% utilization
  }

  const confidence = 0.75

  const explanation = `Allocated ${totalAllocated.toFixed(1)} Mbps across ${agents.length} agents. ` +
    `Bandwidth utilization: ${(utilization * 100).toFixed(1)}%.`

  return { prediction, confidence, explanation }
}

function calculateFairnessScore(allocations: any[]): number {
  if (allocations.length <= 1) return 1.0

  const utilizationRatios = allocations.map(a => a.utilization_ratio)
  const mean = utilizationRatios.reduce((sum, ratio) => sum + ratio, 0) / utilizationRatios.length
  const variance = utilizationRatios.reduce((sum, ratio) => sum + Math.pow(ratio - mean, 2), 0) / utilizationRatios.length
  const stdDev = Math.sqrt(variance)

  // Lower standard deviation = higher fairness
  return Math.max(0, 1 - (stdDev / mean))
}

async function storePrediction(
  supabase: any,
  model: string,
  response: MLInferenceResponse,
  transferId?: string,
  agentId?: string
) {
  try {
    await supabase
      .from('ml_predictions')
      .insert({
        model_type: model,
        prediction: response.prediction,
        confidence: response.confidence,
        model_version: response.model_version,
        transfer_id: transferId,
        agent_id: agentId,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to store prediction:', error)
    // Don't throw - this is not critical for the inference response
  }
} 