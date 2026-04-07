'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Gauge, Loader2, ChevronDown, ChevronRight, ExternalLink,
  CheckCircle2, Circle, AlertTriangle, Zap, Shield,
  Smartphone, Info,
} from 'lucide-react'

/* ── Types ────────────────────────────────────── */

interface SpeedData {
  status: 'completed' | 'running'
  // Progress (when running)
  done?: number; total?: number; currentUrl?: string
  // Data (when completed)
  pages?: PageResult[]
  globalIssues?: GlobalIssue[]
  summary?: Summary
  aiSummary?: string
  analyzedAt?: string
}

interface Summary {
  pagesAnalyzed: number; maxPages: number; avgPerformance: number
  healthy: number; unhealthy: number
  cwvPassing: number; cwvTotal: number; totalGlobalIssues: number
}

interface GlobalIssue {
  id: string; title: string; description: string
  pages: string[]; totalSavingsMs: number; avgSavingsMs: number; done: boolean
}

interface CwvMetric { value: number; category: string }

interface PageResult {
  url: string; impressions: number
  fieldData: { lcp: CwvMetric | null; inp: CwvMetric | null; cls: CwvMetric | null; fcp: CwvMetric | null; ttfb: CwvMetric | null; overallCategory: string | null }
  scores: { performance: number; seo: number; accessibility: number; bestPractices: number }
  metrics: { lcp: number; cls: number; fcp: number; si: number; tbt: number; ttfb: number }
  opportunities: Array<{ id: string; title: string; description: string; savingsMs: number; savingsBytes: number; score: number | null; done: boolean; items: Array<{ url?: string; wastedMs?: number; wastedBytes?: number }> }>
  diagnostics: Array<{ id: string; title: string; displayValue: string | null; score: number | null }>
}

type MainTab = 'global' | 'pages' | 'healthy'

/* ── Helpers ──────────────────────────────────── */

const scoreColor = (s: number) => s >= 90 ? 'text-green-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
const scoreBg = (s: number) => s >= 90 ? 'bg-green-500/20 border-green-500/30' : s >= 50 ? 'bg-amber-500/20 border-amber-500/30' : 'bg-red-500/20 border-red-500/30'
const formatMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
const formatBytes = (b: number) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`

/* ── Component ───────────────────────────────── */

export function SpeedClient({ brand }: { brand: { id: string; domain: string } }) {
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [data, setData] = useState<SpeedData | null>(null)
  const [tab, setTab] = useState<MainTab>('global')
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [expandedGlobal, setExpandedGlobal] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/pagespeed?brandId=${brand.id}`)
      const d = await res.json()
      if (!d) { setInitialLoading(false); return }

      if (d.status === 'running') {
        setData(d)
        setLoading(true)
        // Start polling if not already
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const r = await fetch(`/api/pagespeed?brandId=${brand.id}`)
            const updated = await r.json()
            if (!updated || updated.status !== 'running') {
              clearInterval(pollRef.current!)
              pollRef.current = null
              setData(updated)
              setLoading(false)
            } else {
              setData(updated)
            }
          }, 4000)
        }
      } else if (d.status === 'completed' && d.globalIssues) {
        setData(d)
      }
    } catch {}
    setInitialLoading(false)
  }, [brand.id])

  useEffect(() => {
    fetchData()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchData])

  async function handleRun() {
    setLoading(true)
    try {
      const res = await fetch('/api/pagespeed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brand.id }),
      })
      const result = await res.json()
      if (result.error) { alert(result.error); setLoading(false); return }

      // Start polling
      setData({ status: 'running', done: 0, total: result.total, currentUrl: '' })
      pollRef.current = setInterval(async () => {
        const r = await fetch(`/api/pagespeed?brandId=${brand.id}`)
        const updated = await r.json()
        if (!updated || updated.status !== 'running') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setData(updated)
          setLoading(false)
        } else {
          setData(updated)
        }
      }, 4000)
    } catch { alert('Failed to start analysis'); setLoading(false) }
  }

  const toggleAction = useCallback(async (actionId: string, done: boolean) => {
    setData((prev) => {
      if (!prev || prev.status === 'running') return prev
      const globalIssues = (prev.globalIssues ?? []).map((g) => g.id === actionId ? { ...g, done } : g)
      const pages = (prev.pages ?? []).map((p) => ({
        ...p,
        opportunities: p.opportunities.map((o) => `${p.url}:${o.id}` === actionId ? { ...o, done } : o),
      }))
      return { ...prev, globalIssues, pages }
    })
    fetch('/api/pagespeed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: brand.id, actionId, done }),
    }).catch(() => {})
  }, [brand.id])

  const togglePage = (url: string) => {
    const next = new Set(expandedPages)
    if (next.has(url)) next.delete(url); else next.add(url)
    setExpandedPages(next)
  }
  const toggleGlobal = (id: string) => {
    const next = new Set(expandedGlobal)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandedGlobal(next)
  }

  if (initialLoading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  /* ── Progress state ── */
  if (data?.status === 'running') {
    const done = data.done ?? 0
    const total = data.total ?? 1
    const pct = Math.round((done / total) * 100)
    const currentPath = data.currentUrl ? (() => { try { return new URL(data.currentUrl).pathname } catch { return data.currentUrl } })() : ''
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-1">Site Speed & Core Web Vitals</h2>
        <p className="text-sm text-muted-foreground mb-6">Analyzing your top pages by traffic</p>
        <div className="max-w-lg mx-auto">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              <div>
                <div className="text-sm font-medium">Analyzing page {done + 1} of {total}</div>
                <div className="text-xs text-muted-foreground">Each page takes 10-60 seconds via Google PageSpeed API</div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden mb-2">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{done}/{total} completed</span>
              <span>{pct}%</span>
            </div>
            {currentPath && (
              <div className="mt-3 text-xs text-muted-foreground">
                <Smartphone className="inline h-3 w-3 mr-1" />Currently analyzing: <span className="text-foreground font-medium">{currentPath}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── Empty state ── */
  if (!data?.globalIssues) {
    return (
      <div className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Site Speed & Core Web Vitals</h2>
          <p className="text-sm text-muted-foreground">Analyze performance of your top pages by traffic</p>
        </div>
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col items-center text-center mb-6">
            <Gauge className="mb-3 h-10 w-10 text-brand" />
            <h3 className="text-lg font-semibold">PageSpeed Analysis</h3>
            <p className="mt-1 text-sm text-muted-foreground">Identify performance issues that may affect your Google rankings</p>
          </div>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
              <div><span className="text-foreground font-medium">Top 20 pages by impressions</span> — analyzes your highest-traffic pages first (Google PageSpeed API: ~30s per page)</div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
              <div><span className="text-foreground font-medium">Global issues</span> — problems that affect multiple pages. Fix once, improve everywhere.</div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
              <div><span className="text-foreground font-medium">Per-page fixes</span> — specific issues for each page, prioritized by traffic impact</div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-brand" />
              <div><span className="text-foreground font-medium">Why this matters:</span> Google uses Core Web Vitals (LCP, INP, CLS) as a ranking signal. Slow pages rank lower and have higher bounce rates.</div>
            </div>
          </div>
          <div className="mt-5 text-center">
            <button onClick={handleRun} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50 mx-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
              Run Speed Analysis
            </button>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground text-center">Requires: Diagnostic completed (for page impressions data)</p>
        </div>
      </div>
    )
  }

  /* ── Results ── */
  const { summary, globalIssues, pages, aiSummary } = data as Required<Pick<SpeedData, 'summary' | 'globalIssues' | 'pages' | 'aiSummary'>> & SpeedData
  if (!summary) return null

  const globalDone = globalIssues.filter((g) => g.done).length
  const allPageIssues = pages.flatMap((p) => p.opportunities ?? [])
  const pageIssuesDone = allPageIssues.filter((o) => o.done).length
  const unhealthyPages = pages.filter((p) => p.scores.performance < 70)
  const healthyPages = pages.filter((p) => p.scores.performance >= 70)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Site Speed & Core Web Vitals</h2>
          <p className="text-sm text-muted-foreground">
            <Smartphone className="inline h-3 w-3 mr-1" />Mobile analysis · Top {summary.pagesAnalyzed} pages by impressions
            {data.analyzedAt && ` · ${new Date(data.analyzedAt).toLocaleDateString()}`}
          </p>
        </div>
        <button onClick={handleRun} disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
          {loading ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="mb-5 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{aiSummary}</p>
        </div>
      )}

      {/* Score cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className={`rounded-lg border p-3 text-center ${scoreBg(summary.avgPerformance)}`}>
          <div className={`text-2xl font-bold ${scoreColor(summary.avgPerformance)}`}>{summary.avgPerformance}<span className="text-sm text-muted-foreground font-normal">/100</span></div>
          <div className="text-[10px] text-muted-foreground">Avg Performance</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{summary.avgPerformance >= 90 ? 'Good speed' : summary.avgPerformance >= 50 ? 'Needs improvement' : 'Poor — hurting rankings'}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-green-400">{summary.healthy}<span className="text-sm text-muted-foreground font-normal">/{summary.pagesAnalyzed}</span></div>
          <div className="text-[10px] text-muted-foreground">Healthy Pages</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">Score 70+ — no action needed</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-red-400">{summary.unhealthy}</div>
          <div className="text-[10px] text-muted-foreground">Need Fixing</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">Score below 70 — may affect ranking</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{summary.totalGlobalIssues}</div>
          <div className="text-[10px] text-muted-foreground">Global Issues</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">Fix once → improves all pages</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          {summary.cwvTotal > 0 ? (
            <>
              <div className="text-2xl font-bold"><span className={summary.cwvPassing === summary.cwvTotal ? 'text-green-400' : 'text-amber-400'}>{summary.cwvPassing}/{summary.cwvTotal}</span></div>
              <div className="text-[10px] text-muted-foreground">CWV Passing</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Real Chrome user data</div>
            </>
          ) : (
            <>
              <div className="text-lg font-bold text-muted-foreground">N/A</div>
              <div className="text-[10px] text-muted-foreground">CWV Field Data</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Not enough Chrome traffic yet — using lab data instead</div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button onClick={() => setTab('global')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${tab === 'global' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
            <Zap className="h-3 w-3" />Global Issues ({globalIssues.length})
          </button>
          <button onClick={() => setTab('pages')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${tab === 'pages' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
            <AlertTriangle className="h-3 w-3" />Page Issues ({unhealthyPages.length})
          </button>
          <button onClick={() => setTab('healthy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${tab === 'healthy' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
            <Shield className="h-3 w-3" />Healthy ({healthyPages.length})
          </button>
        </div>
        {tab !== 'healthy' && (
          <div className="text-xs text-muted-foreground">
            {tab === 'global' ? `${globalDone}/${globalIssues.length} resolved` : `${pageIssuesDone}/${allPageIssues.length} resolved`}
          </div>
        )}
      </div>

      {/* ═══ Global Issues ═══ */}
      {tab === 'global' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">Fix these at the site/server level to improve performance across all pages at once.</p>
          {globalIssues.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">No global issues found</div>}
          {globalIssues.map((issue) => {
            const isOpen = expandedGlobal.has(issue.id)
            return (
              <div key={issue.id} className={`rounded-lg border overflow-hidden ${issue.done ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-card'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggleAction(issue.id, !issue.done)} className="flex-shrink-0">
                    {issue.done ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground" />}
                  </button>
                  <button onClick={() => toggleGlobal(issue.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${issue.done ? 'line-through text-muted-foreground' : ''}`}>{issue.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Affects <span className="text-foreground font-medium">{issue.pages.length} pages</span>
                        {issue.avgSavingsMs > 0 && <> · Avg savings: <span className="text-amber-400 font-medium">{formatMs(issue.avgSavingsMs)}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${issue.pages.length >= 10 ? 'bg-red-500/20 text-red-300' : issue.pages.length >= 5 ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-muted-foreground'}`}>
                        {issue.pages.length} pages
                      </span>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-border/50 px-4 py-3 text-xs space-y-2">
                    {issue.description && <p className="text-muted-foreground">{issue.description}</p>}
                    <div>
                      <h4 className="text-[10px] font-medium text-muted-foreground mb-1">Affected pages:</h4>
                      <div className="flex flex-wrap gap-1">
                        {issue.pages.map((path) => (
                          <span key={path} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted-foreground">{path}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ Page Issues ═══ */}
      {tab === 'pages' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground mb-3">Pages with performance score below 70, ordered by traffic impact (highest impressions first).</p>
          {unhealthyPages.length === 0 && <div className="text-center py-8 text-sm text-green-400 font-medium">All analyzed pages are healthy</div>}
          {unhealthyPages.map((page) => {
            const isOpen = expandedPages.has(page.url)
            const path = new URL(page.url).pathname
            const pageDone = page.opportunities.filter((o) => o.done).length
            return (
              <div key={page.url} className="rounded-lg border border-border bg-card overflow-hidden">
                <button onClick={() => togglePage(page.url)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/30 text-left">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{path}</div>
                    <div className="text-[10px] text-muted-foreground">{page.impressions.toLocaleString()} impressions · {page.opportunities.length} issues</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {page.opportunities.length > 0 && (
                      <span className={`text-[10px] ${pageDone === page.opportunities.length && pageDone > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {pageDone}/{page.opportunities.length}
                      </span>
                    )}
                    <div className={`rounded-lg border px-2.5 py-1 text-center ${scoreBg(page.scores.performance)}`}>
                      <div className={`text-sm font-bold ${scoreColor(page.scores.performance)}`}>{page.scores.performance}<span className="text-[9px] font-normal text-muted-foreground">/100</span></div>
                      <div className="text-[8px] text-muted-foreground">speed</div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border px-4 py-3 text-xs space-y-3">
                    {/* CWV metrics */}
                    <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                      {[
                        { label: 'LCP', field: page.fieldData.lcp, lab: page.metrics.lcp, good: 2500, unit: 'ms', desc: 'Largest Contentful Paint' },
                        { label: 'INP', field: page.fieldData.inp, lab: page.metrics.tbt, good: 200, unit: 'ms', desc: 'Interaction to Next Paint' },
                        { label: 'CLS', field: page.fieldData.cls, lab: page.metrics.cls, good: 0.1, unit: '', desc: 'Cumulative Layout Shift' },
                        { label: 'FCP', field: page.fieldData.fcp, lab: page.metrics.fcp, good: 1800, unit: 'ms', desc: 'First Contentful Paint' },
                        { label: 'TTFB', field: page.fieldData.ttfb, lab: page.metrics.ttfb, good: 800, unit: 'ms', desc: 'Time to First Byte' },
                      ].map((m) => {
                        const val = m.field?.value ?? m.lab
                        const isGood = val <= m.good
                        const isMedium = val <= m.good * 1.6
                        return (
                          <div key={m.label} className="rounded-lg bg-surface-2/50 p-2 text-center" title={m.desc}>
                            <div className="text-[10px] text-muted-foreground mb-0.5">{m.label}</div>
                            <div className={`text-sm font-bold ${isGood ? 'text-green-400' : isMedium ? 'text-amber-400' : 'text-red-400'}`}>
                              {m.unit === 'ms' ? formatMs(val) : val.toFixed(2)}
                            </div>
                            <div className="text-[9px] text-muted-foreground">{m.field ? m.field.category.toLowerCase() : 'lab'}</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Fixes */}
                    {page.opportunities.length > 0 && (
                      <div>
                        <h4 className="font-medium text-brand mb-1.5">Fixes:</h4>
                        <div className="space-y-1">
                          {page.opportunities.map((opp) => (
                            <button key={opp.id} onClick={() => toggleAction(`${page.url}:${opp.id}`, !opp.done)}
                              className={`w-full flex items-start gap-2 rounded-lg p-2 text-left transition-colors ${opp.done ? 'bg-green-500/5' : 'bg-surface-2/50 hover:bg-surface-2/80'}`}>
                              {opp.done ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" /> : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                              <div className="flex-1 min-w-0">
                                <span className={opp.done ? 'line-through text-muted-foreground' : 'text-foreground'}>{opp.title}</span>
                                {(opp.savingsMs > 0 || opp.savingsBytes > 0) && (
                                  <span className="ml-1.5 text-amber-400 text-[10px]">
                                    {opp.savingsMs > 0 ? `-${formatMs(opp.savingsMs)}` : ''}{opp.savingsBytes > 0 ? ` -${formatBytes(opp.savingsBytes)}` : ''}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(page.url)}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-brand hover:underline">
                      <ExternalLink className="h-3 w-3" />View full report on PageSpeed.dev
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ Healthy ═══ */}
      {tab === 'healthy' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground mb-3">These pages load fast and provide a good user experience. They are not hurting your Google rankings.</p>
          {healthyPages.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">No pages scored 70+ yet</div>}
          {healthyPages.map((page) => {
            const strengths: string[] = []
            if (page.metrics.lcp <= 2500) strengths.push('Fast LCP')
            if (page.metrics.cls <= 0.1) strengths.push('Stable layout')
            if (page.metrics.fcp <= 1800) strengths.push('Fast first paint')
            if (page.metrics.ttfb <= 800) strengths.push('Fast server')
            if (page.opportunities.length === 0) strengths.push('No issues found')
            return (
              <div key={page.url} className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{new URL(page.url).pathname}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {page.impressions.toLocaleString()} impressions
                    {strengths.length > 0 && <> · <span className="text-green-400/80">{strengths.join(', ')}</span></>}
                  </div>
                </div>
                <div className={`rounded-lg border px-2.5 py-1 text-center ${scoreBg(page.scores.performance)}`}>
                  <div className={`text-sm font-bold ${scoreColor(page.scores.performance)}`}>{page.scores.performance}<span className="text-[9px] font-normal text-muted-foreground">/100</span></div>
                  <div className="text-[8px] text-muted-foreground">speed</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info footer */}
      <div className="mt-6 rounded-lg border border-border bg-card p-3 text-[10px] text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-brand" />
          <div>
            <span className="font-medium text-foreground">About this analysis:</span> We analyze your top {summary.maxPages} pages by organic impressions using Google PageSpeed Insights (mobile only — Google uses mobile-first indexing for ranking).
            Performance scores are from Lighthouse (lab data). {summary.cwvTotal > 0
              ? `Core Web Vitals field data is available for ${summary.cwvTotal} pages from real Chrome users.`
              : 'Core Web Vitals field data is not available (requires sufficient Chrome user traffic). Lab data is used as reference.'
            } Scores: 90+ good, 50-89 needs work, below 50 poor.
          </div>
        </div>
      </div>
    </div>
  )
}
