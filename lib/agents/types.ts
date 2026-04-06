export interface PipelineStep {
  step: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  error?: string
  resultCount?: number
}

export interface DiagnosticContext {
  brandId: string
  diagnosticId: string
}

export interface ContentMapContext {
  brandId: string
  diagnosticId: string
  contentMapId: string
  month: number
  year: number
}
