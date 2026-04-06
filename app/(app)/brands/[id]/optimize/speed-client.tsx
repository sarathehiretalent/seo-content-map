'use client'

import { useState, useEffect } from 'react'
import { Gauge, Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, ExternalLink, Smartphone } from 'lucide-react'

interface PageSpeedSummary {
  pagesAnalyzed: number
  avgPerformance: number
  avgSeo: number
  cwvPassing: number
  cwvTotal: number
  totalOpportunities: number
}

interface CwvMetric { value: number; category: string }

interface PageResult {
  url: string
  strategy: string
  fieldData: {
    lcp: CwvMetric | null; inp: CwvMetric | null; cls: CwvMetric | null
    fcp: CwvMetric | null; ttfb: CwvMetric | null
    overallCategory: string | null
  }
  scores: { performance: number; seo: number; accessibility: number; bestPractices: number }
  metrics: { lcp: number; cls: number; fcp: number; si: number; tbt: number; ttfb: number }
  opportunities: Array<{
    id: string; title: string; description: string; savingsMs: number; savingsBytes: number; score: number | null
    items: Array<{ url?: string; wastedMs?: number; wastedBytes?: number }>
  }>
  diagnostics: Array<{ id: string; title: string; description: string; displayValue: string | null; score: number | null }>
}

interface SpeedData {
  pages: PageResult[]
  summary: PageSpeedSummary
  analyzedAt: string
}

const scoreColor = (score: number) =>
  score >= 90 ? 'text-green-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'
const scoreBg = (score: number) =>
  score >= 90 ? 'bg-green-500/20 border-green-500/30' : score >= 50 ? 'bg-amber-500/20 border-amber-500/30' : 'bg-red-500/20 border-red-500/30'
const cwvColor = (cat: string) =>
  cat === 'FAST' ? 'text-green-400' : cat === 'AVERAGE' ? 'text-amber-400' : 'text-red-400'
const cwvBg = (cat: string) =>
  cat === 'FAST' ? 'bg-green-500/20' : cat === 'AVERAGE' ? 'bg-amber-500/20' : 'bg-red-500/20'

function ScoreGauge({ score, label, size = 'lg' }: { score: number; label: string; size?: 'sm' | 'lg' }) {
  const r = size === 'lg' ? 36 : 22
  const stroke = size === 'lg' ? 5 : 3
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const dim = (r + stroke) * 2
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={dim} height={dim} className="rotate-[-90deg]">
        <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface-2" />
        <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="currentColor" strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className={scoreColor(score)} />
      </svg>
      <div className={`absolute mt-${size === 'lg' ? '4' : '2'}`}>
        <span className={`${size === 'lg' ? 'text-xl' : 'text-sm'} font-bold ${scoreColor(score)}`}>{score}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}

function formatMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}
function formatBytes(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`
}

export function SpeedClient({ brandId }: { brandId: string }) {
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [data, setData] = useState<SpeedData | null>(null)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/pagespeed?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.pages) setData(d) })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  }, [brandId])

  async function handleRun() {
    setLoading(true)
    try {
      const res = await fetch('/api/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      const result = await res.json()
      if (result.error) alert(result.error)
      else setData(result)
    } catch { alert('PageSpeed analysis failed') }
    setLoading(false)
  }

  const togglePage = (url: string) => {
    const next = new Set(expandedPages)
    if (next.has(url)) next.delete(url); else next.add(url)
    setExpandedPages(next)
  }

  if (initialLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  if (!data) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <Gauge className="mx-auto mb-3 h-10 w-10 text-brand" />
        <h3 className="text-lg font-semibold">Core Web Vitals & PageSpeed</h3>
        <p className="mt-1 text-sm text-muted-foreground mb-4">Analyze your top pages for performance, SEO score, and optimization opportunities using Google PageSpeed Insights API.</p>
        <div className="space-y-2 text-xs text-muted-foreground text-left max-w-md mx-auto mb-4">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0">1</span>
            <div><span className="text-foreground font-medium">Core Web Vitals</span> — LCP, INP, CLS from real Chrome users (ranking signal)</div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0">2</span>
            <div><span className="text-foreground font-medium">Lighthouse Scores</span> — Performance, SEO, Accessibility, Best Practices</div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0">3</span>
            <div><span className="text-foreground font-medium">Opportunities</span> — specific fixes with estimated time savings per page</div>
          </div>
        </div>
        <button onClick={handleRun} disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50 mx-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
          {loading ? 'Analyzing pages...' : 'Run PageSpeed Analysis'}
        </button>
        {loading && <p className="mt-2 text-xs text-muted-foreground">This takes 10-60s per page. Analyzing top 20 pages...</p>}
      </div>
    )
  }

  const { pages, summary } = data
  const allOpps = pages.flatMap((p) => p.opportunities.map((o) => ({ ...o, pageUrl: p.url })))
    .sort((a, b) => b.savingsMs - a.savingsMs)

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <Smartphone className="inline h-3 w-3 mr-1" />Mobile · {summary.pagesAnalyzed} pages analyzed
          {data.analyzedAt && ` · ${new Date(data.analyzedAt).toLocaleDateString()}`}
        </div>
        <button onClick={handleRun} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />}
          {loading ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {/* Summary scores */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className={`rounded-lg border p-3 text-center ${scoreBg(summary.avgPerformance)}`}>
          <div className={`text-2xl font-bold ${scoreColor(summary.avgPerformance)}`}>{summary.avgPerformance}</div>
          <div className="text-xs text-muted-foreground">Avg Performance</div>
        </div>
        <div className={`rounded-lg border p-3 text-center ${scoreBg(summary.avgSeo)}`}>
          <div className={`text-2xl font-bold ${scoreColor(summary.avgSeo)}`}>{summary.avgSeo}</div>
          <div className="text-xs text-muted-foreground">Avg SEO Score</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">
            {summary.cwvTotal > 0 ? <span className={summary.cwvPassing === summary.cwvTotal ? 'text-green-400' : 'text-amber-400'}>{summary.cwvPassing}/{summary.cwvTotal}</span> : <span className="text-muted-foreground">N/A</span>}
          </div>
          <div className="text-xs text-muted-foreground">CWV Passing</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{summary.totalOpportunities}</div>
          <div className="text-xs text-muted-foreground">Opportunities</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{summary.pagesAnalyzed}</div>
          <div className="text-xs text-muted-foreground">Pages</div>
        </div>
      </div>

      {/* Top opportunities across all pages */}
      {allOpps.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold mb-2">Top Opportunities (across all pages)</h3>
          <div className="space-y-1.5">
            {allOpps.slice(0, 8).map((opp, i) => (
              <div key={`${opp.pageUrl}-${opp.id}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-card p-2.5 text-xs">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {opp.savingsMs >= 500 ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                  <span className={`font-bold ${opp.savingsMs >= 500 ? 'text-red-400' : 'text-amber-400'}`}>
                    {opp.savingsMs > 0 ? `-${formatMs(opp.savingsMs)}` : opp.savingsBytes > 0 ? `-${formatBytes(opp.savingsBytes)}` : ''}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">{opp.title}</div>
                  <div className="text-muted-foreground truncate">{new URL(opp.pageUrl).pathname}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-page results */}
      <h3 className="text-sm font-semibold mb-2">Per-Page Results</h3>
      <div className="space-y-1">
        {pages.sort((a, b) => a.scores.performance - b.scores.performance).map((page) => {
          const isOpen = expandedPages.has(page.url)
          const path = new URL(page.url).pathname
          return (
            <div key={page.url} className="rounded-lg border border-border bg-card overflow-hidden">
              <button onClick={() => togglePage(page.url)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/30 text-left">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{path}</div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    {page.fieldData.overallCategory && (
                      <span className={cwvColor(page.fieldData.overallCategory)}>CWV: {page.fieldData.overallCategory}</span>
                    )}
                    {page.opportunities.length > 0 && <span>{page.opportunities.length} opportunities</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <div className={`text-sm font-bold ${scoreColor(page.scores.performance)}`}>{page.scores.performance}</div>
                    <div className="text-[9px] text-muted-foreground">Perf</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-bold ${scoreColor(page.scores.seo)}`}>{page.scores.seo}</div>
                    <div className="text-[9px] text-muted-foreground">SEO</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-bold ${scoreColor(page.scores.accessibility)}`}>{page.scores.accessibility}</div>
                    <div className="text-[9px] text-muted-foreground">A11y</div>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-3 text-xs space-y-3">
                  {/* Core Web Vitals */}
                  <div>
                    <h4 className="font-medium mb-2">Core Web Vitals {page.fieldData.overallCategory ? <span className={`ml-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${cwvBg(page.fieldData.overallCategory)} ${cwvColor(page.fieldData.overallCategory)}`}>{page.fieldData.overallCategory}</span> : <span className="ml-1 text-muted-foreground">(no field data)</span>}</h4>
                    <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                      {[
                        { label: 'LCP', field: page.fieldData.lcp, lab: page.metrics.lcp, unit: 'ms', good: 2500 },
                        { label: 'INP', field: page.fieldData.inp, lab: page.metrics.tbt, unit: 'ms', good: 200 },
                        { label: 'CLS', field: page.fieldData.cls, lab: page.metrics.cls, unit: '', good: 0.1 },
                        { label: 'FCP', field: page.fieldData.fcp, lab: page.metrics.fcp, unit: 'ms', good: 1800 },
                        { label: 'TTFB', field: page.fieldData.ttfb, lab: page.metrics.ttfb, unit: 'ms', good: 800 },
                      ].map((m) => (
                        <div key={m.label} className="rounded-lg bg-surface-2/50 p-2 text-center">
                          <div className="text-[10px] text-muted-foreground mb-0.5">{m.label}</div>
                          {m.field ? (
                            <div className={`text-sm font-bold ${cwvColor(m.field.category)}`}>
                              {m.unit === 'ms' ? formatMs(m.field.value) : m.field.value.toFixed(2)}
                            </div>
                          ) : (
                            <div className={`text-sm font-bold ${m.lab <= m.good ? 'text-green-400' : m.lab <= m.good * 1.6 ? 'text-amber-400' : 'text-red-400'}`}>
                              {m.unit === 'ms' ? formatMs(m.lab) : m.lab.toFixed(2)}
                              <span className="text-[9px] text-muted-foreground ml-0.5">lab</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lighthouse scores */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Performance', score: page.scores.performance },
                      { label: 'SEO', score: page.scores.seo },
                      { label: 'Accessibility', score: page.scores.accessibility },
                      { label: 'Best Practices', score: page.scores.bestPractices },
                    ].map((s) => (
                      <div key={s.label} className={`rounded-lg border p-2 text-center ${scoreBg(s.score)}`}>
                        <div className={`text-lg font-bold ${scoreColor(s.score)}`}>{s.score}</div>
                        <div className="text-[9px] text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Opportunities for this page */}
                  {page.opportunities.length > 0 && (
                    <div>
                      <h4 className="font-medium text-brand mb-1.5">Opportunities</h4>
                      <div className="space-y-1">
                        {page.opportunities.map((opp) => (
                          <div key={opp.id} className="rounded-lg bg-surface-2/50 p-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`font-bold ${opp.savingsMs >= 500 ? 'text-red-400' : 'text-amber-400'}`}>
                                {opp.savingsMs > 0 ? `-${formatMs(opp.savingsMs)}` : opp.savingsBytes > 0 ? `-${formatBytes(opp.savingsBytes)}` : ''}
                              </span>
                              <span className="font-medium text-foreground">{opp.title}</span>
                            </div>
                            {opp.items.length > 0 && (
                              <div className="text-muted-foreground mt-1 space-y-0.5">
                                {opp.items.slice(0, 3).map((item, j) => (
                                  <div key={j} className="truncate">
                                    {item.url ? new URL(item.url).pathname.slice(0, 60) : ''}
                                    {item.wastedMs ? ` (${formatMs(item.wastedMs)})` : ''}
                                    {item.wastedBytes ? ` (${formatBytes(item.wastedBytes)})` : ''}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diagnostics */}
                  {page.diagnostics.length > 0 && (
                    <div>
                      <h4 className="font-medium text-muted-foreground mb-1.5">Diagnostics</h4>
                      <div className="space-y-1">
                        {page.diagnostics.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 text-muted-foreground">
                            <span className={d.score !== null && d.score < 0.5 ? 'text-red-400' : 'text-amber-400'}>&#9679;</span>
                            <span>{d.title}</span>
                            {d.displayValue && <span className="text-foreground font-medium">{d.displayValue}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Link to full report */}
                  <div className="border-t border-border/50 pt-2">
                    <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(page.url)}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-brand hover:underline">
                      <ExternalLink className="h-3 w-3" />View full PageSpeed report
                    </a>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
