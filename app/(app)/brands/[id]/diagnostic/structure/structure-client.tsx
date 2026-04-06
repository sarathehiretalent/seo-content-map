'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, AlertTriangle, FileQuestion, Network, RefreshCw } from 'lucide-react'

interface Pillar {
  name: string
  keyword: string
  pages: string[]
  clusters: Array<{ name: string; keyword: string; pages: string[] }>
}

interface OrphanPage {
  url: string
  topKeyword: string
  impressions: number
  reason: string
}

interface PageInfo {
  url: string
  topKeyword: string
  impressions: number
  keywordCount: number
}

interface Props {
  diagnostic: {
    currentStructure: string | null
    gaps: string | null
    cannibalization: string | null
    summary: string | null
  }
  allPages: PageInfo[]
}

export function StructureClient({ diagnostic, allPages }: Props) {
  const [showOrphans, setShowOrphans] = useState(false)
  const [showUnclassified, setShowUnclassified] = useState(false)
  const [showGaps, setShowGaps] = useState(true)
  const [showCannibal, setShowCannibal] = useState(true)
  const [running, setRunning] = useState(false)
  const totalPagesWithTraffic = allPages.length

  const structure = diagnostic.currentStructure ? JSON.parse(diagnostic.currentStructure) : { pillars: [], orphanPages: [] }
  const pillars: Pillar[] = structure.pillars ?? []
  const orphanPages: OrphanPage[] = structure.orphanPages ?? []
  const gaps: Array<{ topic: string; keywords: string[]; reason: string }> = diagnostic.gaps ? JSON.parse(diagnostic.gaps) : []
  const cannibalization: Array<{ keyword: string; pages: string[]; recommendation: string }> = diagnostic.cannibalization ? JSON.parse(diagnostic.cannibalization) : []

  // Count pages in structure
  const pagesInStructure = new Set<string>()
  pillars.forEach((p) => {
    (p.pages ?? []).forEach((u) => pagesInStructure.add(u))
    ;(p.clusters ?? []).forEach((c) => (c.pages ?? []).forEach((u) => pagesInStructure.add(u)))
  })

  const totalClusters = pillars.reduce((s, p) => s + (p.clusters?.length ?? 0), 0)

  // Compute unclassified pages — in allPages but not in structure or orphans
  const classifiedUrls = new Set<string>()
  pagesInStructure.forEach((u) => { classifiedUrls.add(u); classifiedUrls.add(u.replace(/^https?:\/\/[^/]+/, '')) })
  orphanPages.forEach((p) => { classifiedUrls.add(p.url); classifiedUrls.add(p.url.replace(/^https?:\/\/[^/]+/, '')) })

  const unclassifiedPages = allPages
    .filter((p) => {
      const short = p.url.replace(/^https?:\/\/[^/]+/, '')
      return !classifiedUrls.has(p.url) && !classifiedUrls.has(short)
    })
    .sort((a, b) => b.impressions - a.impressions)

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Current Content Structure</h2>
          <p className="text-sm text-muted-foreground">
            AI-detected pillar/cluster structure based on real GSC data
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Run after publishing new content or making site changes
          </p>
        </div>
        <button
          onClick={async () => {
            setRunning(true)
            try {
              await fetch('/api/run-structure', { method: 'POST' })
            } catch { /* ignore */ }
            setRunning(false)
            window.location.reload()
          }}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Analyzing...' : 'Run Structure Analysis'}
        </button>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-3 md:grid-cols-6">
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold text-brand">{pillars.length}</div>
          <div className="text-xs text-muted-foreground">Pillars</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold">{totalClusters}</div>
          <div className="text-xs text-muted-foreground">Clusters</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold text-green-400">{pagesInStructure.size}</div>
          <div className="text-xs text-muted-foreground">In Structure</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center cursor-pointer hover:border-brand/30 border border-transparent" onClick={() => setShowOrphans(!showOrphans)}>
          <div className="text-xl font-bold text-amber-400">{orphanPages.length}</div>
          <div className="text-xs text-muted-foreground">Orphan Pages</div>
          <div className="text-[9px] text-muted-foreground/60">click to view</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center cursor-pointer hover:border-brand/30 border border-transparent" onClick={() => setShowUnclassified(!showUnclassified)}>
          <div className="text-xl font-bold text-muted-foreground">{unclassifiedPages.length}</div>
          <div className="text-xs text-muted-foreground">Unclassified</div>
          <div className="text-[9px] text-muted-foreground/60">click to view</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold">{totalPagesWithTraffic}</div>
          <div className="text-xs text-muted-foreground">Total w/ Traffic</div>
        </div>
      </div>

      {/* Pillars & Clusters */}
      <div className="mb-6">
        <h3 className="mb-3 font-medium flex items-center gap-2"><Network className="h-4 w-4 text-brand" /> Pillar & Cluster Structure</h3>
        <div className="space-y-3">
          {pillars.map((pillar, i) => (
            <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-surface-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs font-medium text-brand">PILLAR</span>
                  <span className="font-medium">{pillar.name}</span>
                  <span className="text-sm text-muted-foreground">({pillar.keyword})</span>
                  <span className="ml-auto text-xs text-muted-foreground">{(pillar.clusters ?? []).length} clusters</span>
                </div>
                {(pillar.pages ?? []).length > 0 && (
                  <div className="mt-1 ml-16">
                    {pillar.pages.map((url, j) => (
                      <div key={j} className="text-xs text-muted-foreground truncate">{url}</div>
                    ))}
                  </div>
                )}
              </div>
              {(pillar.clusters ?? []).length > 0 && (
                <div className="divide-y divide-border/50">
                  {pillar.clusters.map((cluster, j) => (
                    <div key={j} className="px-4 py-2 ml-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-300">CLUSTER</span>
                        <span className="text-sm font-medium">{cluster.name}</span>
                        <span className="text-xs text-muted-foreground">({cluster.keyword})</span>
                      </div>
                      {(cluster.pages ?? []).length > 0 && (
                        <div className="mt-0.5 ml-16">
                          {cluster.pages.map((url, k) => (
                            <div key={k} className="text-xs text-muted-foreground truncate">{url}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Orphan Pages — collapsible */}
      {orphanPages.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowOrphans(!showOrphans)} className="mb-2 flex items-center gap-2 font-medium hover:text-brand">
            {showOrphans ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <FileQuestion className="h-4 w-4 text-amber-400" />
            Orphan Pages ({orphanPages.length})
            <span className="text-xs text-muted-foreground font-normal ml-2">Pages with traffic not part of any pillar/cluster</span>
          </button>
          {showOrphans && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Page</th>
                    <th className="px-3 py-2 text-left font-medium">Top Keyword</th>
                    <th className="px-3 py-2 text-right font-medium">Impressions</th>
                    <th className="px-3 py-2 text-left font-medium">Why Orphan</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanPages.map((page, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-2/30">
                      <td className="px-3 py-1.5 font-medium truncate max-w-[200px]" title={page.url}>{page.url}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{page.topKeyword}</td>
                      <td className="px-3 py-1.5 text-right">{page.impressions?.toLocaleString() ?? '—'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{page.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Unclassified Pages */}
      {unclassifiedPages.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowUnclassified(!showUnclassified)} className="mb-2 flex items-center gap-2 font-medium hover:text-brand">
            {showUnclassified ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Unclassified Pages ({unclassifiedPages.length})
            <span className="text-xs text-muted-foreground font-normal ml-2">Pages with traffic not analyzed by AI — low traffic or missed in analysis</span>
          </button>
          {showUnclassified && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">Page</th>
                    <th className="px-3 py-2 text-left font-medium">Top Keyword</th>
                    <th className="px-3 py-2 text-right font-medium">Impressions</th>
                    <th className="px-3 py-2 text-right font-medium">Keywords</th>
                  </tr>
                </thead>
                <tbody>
                  {unclassifiedPages.map((page, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-2/30">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium truncate max-w-[250px]" title={page.url}>
                        {page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{page.topKeyword}</td>
                      <td className="px-3 py-1.5 text-right">{page.impressions.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">{page.keywordCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowGaps(!showGaps)} className="mb-2 flex items-center gap-2 font-medium hover:text-brand">
            {showGaps ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Content Gaps ({gaps.length})
          </button>
          {showGaps && (
            <div className="space-y-2">
              {gaps.map((gap, i) => (
                <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="font-medium text-amber-400">{gap.topic}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{gap.reason}</p>
                  {(gap.keywords ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {gap.keywords.map((kw, j) => (
                        <span key={j} className="rounded bg-surface-2 px-2 py-0.5 text-[10px]">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cannibalization */}
      {cannibalization.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowCannibal(!showCannibal)} className="mb-2 flex items-center gap-2 font-medium hover:text-brand">
            {showCannibal ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Keyword Cannibalization ({cannibalization.length})
          </button>
          {showCannibal && (
            <div className="space-y-2">
              {cannibalization.map((c, i) => (
                <div key={i} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="font-medium text-red-400">{c.keyword}</div>
                  <div className="mt-1 space-y-0.5">
                    {(c.pages ?? []).map((page, j) => (
                      <div key={j} className="text-xs text-muted-foreground truncate">{page}</div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-amber-400">{c.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {diagnostic.summary && (
        <div>
          <h3 className="mb-2 font-medium">AI Summary</h3>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{diagnostic.summary}</p>
          </div>
        </div>
      )}
    </div>
  )
}
