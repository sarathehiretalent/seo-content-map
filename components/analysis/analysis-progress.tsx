'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface PipelineStep {
  step: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  error?: string
  resultCount?: number
}

interface AnalysisProgressProps {
  pipelineId: string
  type: 'diagnostic' | 'content-map' | 'serp-analysis' | 'page-audit' | 'content-map-gen'
  onComplete?: () => void
}

export function AnalysisProgress({ pipelineId, type, onComplete }: AnalysisProgressProps) {
  const [steps, setSteps] = useState<PipelineStep[]>([])
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    const interval = setInterval(async () => {
      const endpoint = type === 'diagnostic'
        ? `/api/diagnostic/status?id=${pipelineId}`
        : type === 'serp-analysis'
          ? `/api/serp-analysis/status?id=${pipelineId}`
          : type === 'page-audit'
            ? `/api/page-audit/status?id=${pipelineId}`
            : type === 'content-map-gen'
              ? `/api/content-map-gen/status?id=${pipelineId}`
              : `/api/content-map/status?id=${pipelineId}`

      const res = await fetch(endpoint)
      if (!res.ok) return

      const data = await res.json()
      setSteps(data.pipelineLog ?? [])
      setStatus(data.status)

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval)
        onComplete?.()
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [pipelineId, type, onComplete])

  const statusIcon = (s: PipelineStep['status']) => {
    switch (s) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-400" />
      case 'running': return <Loader2 className="h-4 w-4 animate-spin text-brand" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-400" />
      default: return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const completedCount = steps.filter((s) => s.status === 'completed').length
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Pipeline Progress</h3>
        <span className={`rounded px-2 py-1 text-xs font-medium ${
          status === 'completed' ? 'bg-green-500/20 text-green-400'
          : status === 'failed' ? 'bg-red-500/20 text-red-400'
          : 'bg-brand/20 text-brand'
        }`}>
          {status}
        </span>
      </div>

      <div className="mb-4 h-2 rounded-full bg-surface-2">
        <div
          className="h-2 rounded-full bg-brand transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
            {statusIcon(step.status)}
            <span className={`flex-1 text-sm ${
              step.status === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}>
              {step.step}
            </span>
            {step.resultCount !== undefined && (
              <span className="text-xs text-muted-foreground">
                {step.resultCount} results
              </span>
            )}
            {step.error && (
              <span className="text-xs text-red-400">{step.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
