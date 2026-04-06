'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Stethoscope, BarChart3, Search, Network, Trash2 } from 'lucide-react'
import { AnalysisProgress } from '@/components/analysis/analysis-progress'
import { deleteDiagnostic, deleteAllDiagnostics } from '@/lib/actions/diagnostics'

interface Brand {
  id: string
  name: string
  domain: string
  gscProperty: string | null
  vertical: string | null
  description: string | null
  diagnostics: Array<{
    id: string
    name: string
    status: string
    summary: string | null
    createdAt: Date
  }>
  _count: { keywords: number }
}

export function DiagnosticClient({ brand }: { brand: Brand }) {
  const router = useRouter()
  const [runningId, setRunningId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const lastCompleted = brand.diagnostics.find((d) => d.status === 'completed')

  const hasBrandContext = !!(brand.description && brand.description.length > 20)

  async function handleRunDiagnostic() {
    if (!hasBrandContext) {
      alert('Please add a brand description in Settings first. The AI needs to understand your brand to filter relevant keywords.')
      return
    }
    setLoading(true)
    const res = await fetch('/api/diagnostic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: brand.id }),
    })
    const data = await res.json()
    if (data.error) {
      alert(`Error: ${data.error}`)
      setLoading(false)
      return
    }
    setRunningId(data.diagnosticId)
    setLoading(false)
  }

  async function handleDeleteDiag(diagId: string) {
    if (!confirm('Delete this diagnostic?')) return
    setDeletingId(diagId)
    await deleteDiagnostic(diagId)
    setDeletingId(null)
    router.refresh()
  }

  async function handleClearAll() {
    if (!confirm('Delete ALL diagnostics and keywords for this brand? This will reset the diagnostic data.')) return
    await deleteAllDiagnostics(brand.id)
    router.refresh()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Diagnostic</h2>
          <p className="text-sm text-muted-foreground">
            Analyze current rankings, SERP features, and content structure
          </p>
          {!hasBrandContext && (
            <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
              <p className="text-xs text-red-400 font-medium">
                Brand description required before running diagnostic.
              </p>
              <p className="text-xs text-muted-foreground">
                Go to{' '}
                <Link href={`/brands/${brand.id}/settings`} className="text-brand underline">
                  Settings
                </Link>
                {' '}→ click &quot;Auto-detect from website&quot; or write a description manually.
                This helps the AI filter only keywords relevant to your brand.
              </p>
            </div>
          )}
          {!brand.gscProperty && hasBrandContext && (
            <p className="mt-1 text-xs text-amber-400">
              GSC not connected. Using DataForSEO for keyword discovery.{' '}
              <Link href={`/brands/${brand.id}/settings`} className="underline">
                Connect GSC in Settings
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {brand.diagnostics.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 rounded-lg border border-red-500/50 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Clear All
            </button>
          )}
          <button
            onClick={handleRunDiagnostic}
            disabled={loading || !!runningId}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            <Stethoscope className="h-4 w-4" />
            {loading ? 'Starting...' : 'Run Diagnostic'}
          </button>
        </div>
      </div>

      {runningId && (
        <div className="mb-6">
          <AnalysisProgress
            pipelineId={runningId}
            type="diagnostic"
            onComplete={() => {
              setRunningId(null)
              router.refresh()
            }}
          />
        </div>
      )}

      {lastCompleted && (
        <div className="mb-6">
          <h3 className="mb-3 font-medium">Latest Diagnostic Results</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Link
              href={`/brands/${brand.id}/diagnostic/rankings`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/30"
            >
              <BarChart3 className="h-5 w-5 text-brand" />
              <div>
                <div className="font-medium">Rankings</div>
                <div className="text-sm text-muted-foreground">
                  {brand._count.keywords} keywords tracked
                </div>
              </div>
            </Link>
            <Link
              href={`/brands/${brand.id}/diagnostic/serp`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/30"
            >
              <Search className="h-5 w-5 text-brand" />
              <div>
                <div className="font-medium">SERP Analysis</div>
                <div className="text-sm text-muted-foreground">Features & ownership</div>
              </div>
            </Link>
            <Link
              href={`/brands/${brand.id}/diagnostic/structure`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand/30"
            >
              <Network className="h-5 w-5 text-brand" />
              <div>
                <div className="font-medium">Current Structure</div>
                <div className="text-sm text-muted-foreground">Pillars, gaps, cannibalization</div>
              </div>
            </Link>
          </div>

          {lastCompleted.summary && (
            <div className="mt-4 rounded-lg border border-border bg-card p-4">
              <h4 className="mb-2 text-sm font-medium">AI Summary</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {lastCompleted.summary}
              </p>
            </div>
          )}
        </div>
      )}

      {brand.diagnostics.length > 0 && (
        <div>
          <h3 className="mb-3 font-medium">History</h3>
          <div className="space-y-2">
            {brand.diagnostics.map((diag) => (
              <div
                key={diag.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <span className="text-sm font-medium">{diag.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(diag.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      diag.status === 'completed'
                        ? 'bg-green-500/20 text-green-400'
                        : diag.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {diag.status}
                  </span>
                  <button
                    onClick={() => handleDeleteDiag(diag.id)}
                    disabled={deletingId === diag.id}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    title="Delete diagnostic"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {brand.diagnostics.length === 0 && !runningId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No diagnostics yet</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Run a diagnostic to analyze your current SEO status.
            {brand.gscProperty
              ? ' It will fetch rankings from GSC and enrich with DataForSEO.'
              : ' It will use DataForSEO to discover keywords for your domain.'}
          </p>
        </div>
      )}
    </div>
  )
}
