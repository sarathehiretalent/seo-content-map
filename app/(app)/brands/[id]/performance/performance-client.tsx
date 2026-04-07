'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, Loader2, ArrowUpRight, ArrowDownRight,
  Target, DollarSign, Eye, MousePointerClick, Hash, ChevronDown, ChevronRight,
  Crosshair, AlertTriangle, CheckCircle2, Info, Minus, FileText,
} from 'lucide-react'

type Period = 7 | 14 | 28 | 90

interface Snapshot { weekOf: string; totalClicks: number; totalImpressions: number; avgPosition: number; top10Count: number; top3Count: number; trafficValue: number; contentPublished: number; contentRanking: number }

interface PerformanceData {
  period: { days: number; currentStart: string; currentEnd: string; previousStart: string; previousEnd: string }
  overview: { current: any; previous: any; trafficValue: { current: number; previous: number } }
  distribution: { current: any; previous: any }
  movement: { winners: any[]; losers: any[]; new: any[]; lost: any[] }
  strikingDistance: any[]
  contentPerformance: any[]
  targetKeywords: any[]
  execution: { content: { total: number; published: number }; aeo: { total: number; done: number } }
  snapshots: Snapshot[]
  aiSummary: string
}

function dd(current: number, previous: number) {
  const diff = current - previous
  const pct = previous === 0 ? (current > 0 ? 100 : 0) : (diff / previous) * 100
  return { value: diff, pct, dir: Math.abs(pct) < 0.5 ? 'flat' as const : diff > 0 ? 'up' as const : 'down' as const }
}

function Delta({ current, previous, invert, showValue }: { current: number; previous: number; invert?: boolean; showValue?: boolean }) {
  const { value, pct, dir } = dd(current, previous)
  const isGood = invert ? dir === 'down' : dir === 'up'
  if (dir === 'flat') return <span className="text-[10px] text-muted-foreground">—</span>
  return (
    <span className={`text-[10px] flex items-center gap-0.5 font-medium ${isGood ? 'text-green-400' : 'text-red-400'}`}>
      {dir === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {showValue && <>{value > 0 ? '+' : ''}{Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString()} · </>}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function fmtWeek(s: string) { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

export function PerformanceClient({ brand }: { brand: { id: string; domain: string; gscProperty: string | null } }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PerformanceData | null>(null)
  const [period, setPeriod] = useState<Period>(28)
  const [showLosers, setShowLosers] = useState(false)
  const [showStriking, setShowStriking] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [showTargetKws, setShowTargetKws] = useState(false)
  const [chartMetric, setChartMetric] = useState<'clicks' | 'impressions' | 'top10' | 'position'>('clicks')
  const [expandedRange, setExpandedRange] = useState<string | null>(null)

  const fetchData = useCallback(async (p: Period, refresh = false) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/performance?brandId=${brand.id}&period=${p}${refresh ? '&refresh=1' : ''}`)
      const result = await res.json()
      if (result.error) setError(result.error); else setData(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    setLoading(false)
  }, [brand.id])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  if (!brand.gscProperty) return (
    <div className="p-6"><div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
      <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" /><h3 className="text-lg font-semibold">GSC Not Connected</h3>
      <p className="mt-2 text-sm text-muted-foreground">Connect Google Search Console in Settings to see performance data.</p>
    </div></div>
  )

  if (loading && !data) return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading performance data from GSC...</span></div>

  if (error && !data) return (
    <div className="p-6"><div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <BarChart3 className="mx-auto mb-3 h-10 w-10 text-red-400" /><h3 className="text-lg font-semibold text-red-400">Error</h3>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <button onClick={() => fetchData(period)} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90">Retry</button>
    </div></div>
  )

  if (!data) return null

  const { overview: ov, distribution, movement, strikingDistance, contentPerformance, targetKeywords, execution, snapshots, aiSummary } = data

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance Report</h2>
          <p className="text-sm text-muted-foreground">
            {snapshots.length > 1 && <><span className="text-brand">{snapshots.length} weeks tracked</span> · </>}
            Data from Google Search Console
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button onClick={() => fetchData(period, true)} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
            <BarChart3 className="h-3 w-3" />Refresh
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {([7, 14, 28, 90] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 font-medium ${period === p ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2 text-muted-foreground'}`}>
                {p === 7 ? '1W' : p === 14 ? '2W' : p === 28 ? '1M' : '3M'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison context banner */}
      <div className="rounded-lg bg-surface-2/50 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-brand flex-shrink-0" />
        <span>
          Comparing <span className="text-foreground font-medium">{fmtWeek(data.period.currentStart)} — {fmtWeek(data.period.currentEnd)}</span>
          {' '}vs <span className="text-foreground font-medium">{fmtWeek(data.period.previousStart)} — {fmtWeek(data.period.previousEnd)}</span>
          {' '}({data.period.days} days each)
        </span>
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Organic Clicks', icon: MousePointerClick, cur: ov.current.totalClicks, prev: ov.previous.totalClicks, fmt: (n: number) => n.toLocaleString() },
          { label: 'Impressions', icon: Eye, cur: ov.current.totalImpressions, prev: ov.previous.totalImpressions, fmt: (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) },
          { label: 'Avg CTR', icon: Target, cur: ov.current.avgCtr, prev: ov.previous.avgCtr, fmt: (n: number) => `${(n * 100).toFixed(1)}%` },
          { label: 'Avg Position', icon: Hash, cur: ov.current.avgPosition, prev: ov.previous.avgPosition, fmt: (n: number) => n.toFixed(1), inv: true },
          { label: 'Top 10 KWs', icon: TrendingUp, cur: distribution.current.top10, prev: distribution.previous.top10, fmt: (n: number) => String(n) },
          { label: 'Traffic Value', icon: DollarSign, cur: ov.trafficValue.current, prev: ov.trafficValue.previous, fmt: (n: number) => `$${n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString()}` },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <k.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</span>
            </div>
            <div className="text-2xl font-bold mb-1">{k.fmt(k.cur)}</div>
            <Delta current={k.cur} previous={k.prev} invert={k.inv} showValue />
            <div className="text-[9px] text-muted-foreground mt-1">was {k.fmt(k.prev)} in previous {data.period.days}d</div>
          </div>
        ))}
      </div>

      {/* ── Weekly Evolution Line Chart ── */}
      {snapshots.length >= 1 && (() => {
        const metrics = [
          { key: 'clicks', label: 'Clicks', get: (s: Snapshot) => s.totalClicks, fmt: (n: number) => n.toLocaleString(), color: '#2dd4bf' },
          { key: 'impressions', label: 'Impressions', get: (s: Snapshot) => s.totalImpressions, fmt: (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n), color: '#818cf8' },
          { key: 'top10', label: 'Top 10', get: (s: Snapshot) => s.top10Count, fmt: (n: number) => String(n), color: '#4ade80' },
          { key: 'position', label: 'Position', get: (s: Snapshot) => s.avgPosition, fmt: (n: number) => n.toFixed(1), color: '#fbbf24', invert: true },
        ]
        const cfg = metrics.find((m) => m.key === chartMetric)!
        const values = snapshots.map(cfg.get)
        const dataMin = Math.min(...values)
        const dataMax = Math.max(...values)
        const padding = (dataMax - dataMin) * 0.15 || 1
        const yMin = cfg.invert ? dataMin - padding : Math.max(0, dataMin - padding)
        const yMax = cfg.invert ? dataMax + padding : dataMax + padding
        const yRange = yMax - yMin || 1

        const W = 800, H = 260, PL = 55, PR = 20, PT = 15, PB = 35
        const cW = W - PL - PR, cH = H - PT - PB

        const points = snapshots.map((s, i) => {
          const x = PL + (snapshots.length === 1 ? cW / 2 : (i / (snapshots.length - 1)) * cW)
          const val = cfg.get(s)
          const yNorm = cfg.invert ? (val - yMin) / yRange : 1 - (val - yMin) / yRange
          const y = PT + yNorm * cH
          return { x, y, val, snap: s }
        })

        const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${PT + cH} L ${points[0].x} ${PT + cH} Z`

        // Y axis ticks
        const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
          const val = cfg.invert ? yMin + t * yRange : yMax - t * yRange
          return { y: PT + t * cH, label: cfg.fmt(val) }
        })

        // First and last values for trend indicator
        const first = values[0], last = values[values.length - 1]
        const trendUp = cfg.invert ? last < first : last > first
        const trendPct = first !== 0 ? Math.abs(((last - first) / first) * 100) : 0

        return (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">{cfg.label} — Weekly Trend</h3>
                <p className="text-[10px] text-muted-foreground">
                  {snapshots.length} weekly snapshots · Each point = 1 week of data · {fmtWeek(snapshots[0].weekOf)} to {fmtWeek(snapshots[snapshots.length - 1].weekOf)}
                  {snapshots.length >= 2 && (
                    <span className={`ml-2 font-medium ${trendUp ? 'text-green-400' : trendPct < 1 ? 'text-muted-foreground' : 'text-red-400'}`}>
                      {trendUp ? '↑' : trendPct < 1 ? '→' : '↓'} {trendPct.toFixed(1)}% overall {cfg.invert ? (trendUp ? 'improvement' : 'decline') : (trendUp ? 'growth' : 'decline')}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden text-[10px]">
                {metrics.map((m) => (
                  <button key={m.key} onClick={() => setChartMetric(m.key as any)}
                    className={`px-3 py-1.5 font-medium ${chartMetric === m.key ? 'bg-brand text-primary-foreground' : 'text-muted-foreground hover:bg-surface-2'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 300 }}>
              {/* Grid lines */}
              {yTicks.map((t, i) => (
                <g key={i}>
                  <line x1={PL} y1={t.y} x2={W - PR} y2={t.y} stroke="currentColor" strokeWidth="0.5" className="text-border/40" />
                  <text x={PL - 8} y={t.y + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">{t.label}</text>
                </g>
              ))}

              {/* Area fill */}
              <path d={areaPath} fill={cfg.color} opacity="0.08" />

              {/* Line */}
              <path d={linePath} fill="none" stroke={cfg.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

              {/* Data points + hover areas */}
              {points.map((p, i) => (
                <g key={i} className="group">
                  {/* Hover area */}
                  <rect x={p.x - cW / snapshots.length / 2} y={PT} width={cW / snapshots.length} height={cH} fill="transparent" className="cursor-pointer" />
                  {/* Vertical guide on hover */}
                  <line x1={p.x} y1={PT} x2={p.x} y2={PT + cH} stroke={cfg.color} strokeWidth="1" opacity="0" className="group-hover:opacity-30" />
                  {/* Dot — last one is larger (current week) */}
                  <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 5 : 4} fill={cfg.color} opacity={i === points.length - 1 ? 0.3 : 0} className="group-hover:opacity-100" />
                  <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={cfg.color} />
                  {/* Tooltip */}
                  {(() => {
                    const weekEnd = new Date(new Date(p.snap.weekOf + 'T12:00:00').getTime() + 6 * 86400000)
                    const isLastWeek = i === snapshots.length - 1
                    const tooltipW = 190, tooltipH = 70
                    return (
                      <foreignObject x={Math.min(p.x - tooltipW / 2, W - tooltipW - 5)} y={Math.max(p.y - tooltipH - 10, 0)} width={tooltipW} height={tooltipH} className="pointer-events-none opacity-0 group-hover:opacity-100">
                        <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[10px] shadow-lg">
                          <div className="font-medium text-foreground">Week of {fmtWeek(p.snap.weekOf)} — {fmtWeek(weekEnd.toISOString().split('T')[0])}{isLastWeek ? ' (current)' : ''}</div>
                          <div style={{ color: cfg.color }} className="font-bold text-xs">{cfg.label}: {cfg.fmt(p.val)}</div>
                          {i > 0 && (() => {
                            const prev = cfg.get(snapshots[i - 1])
                            const diff = p.val - prev
                            const good = cfg.invert ? diff < 0 : diff > 0
                            return <div className={good ? 'text-green-400' : diff === 0 ? 'text-muted-foreground' : 'text-red-400'}>
                              {diff > 0 ? '+' : ''}{cfg.fmt(diff)} vs previous week
                            </div>
                          })()}
                        </div>
                      </foreignObject>
                    )
                  })()}
                </g>
              ))}

              {/* X axis labels */}
              {snapshots.map((s, i) => {
                const showLabel = snapshots.length <= 8 || i % Math.ceil(snapshots.length / 7) === 0 || i === snapshots.length - 1
                if (!showLabel) return null
                const x = PL + (snapshots.length === 1 ? cW / 2 : (i / (snapshots.length - 1)) * cW)
                const isLast = i === snapshots.length - 1
                return <text key={i} x={x} y={H - 8} textAnchor="middle" className={isLast ? 'fill-brand' : 'fill-muted-foreground'} fontSize="9">W{i + 1} · {fmtWeek(s.weekOf)}</text>
              })}
            </svg>
          </div>
        )
      })()}

      {snapshots.length < 1 && (
        <div className="rounded-lg border border-border bg-card p-5 text-center">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <h3 className="text-sm font-semibold">No Data Yet</h3>
          <p className="text-xs text-muted-foreground mt-1">Run a Diagnostic first, then visit this page to start tracking performance.</p>
        </div>
      )}

      {/* ── Ranking Distribution ── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Ranking Distribution</h3>
        <p className="text-[10px] text-muted-foreground mb-4">Keywords your site ranks for in Google, grouped by position. Click any range to see top keywords. Changes vs previous {data.period.days} days.</p>
        <div className="space-y-2">
          {[
            { key: 'top3', label: 'Position 1–3', cur: distribution.current.top3, prev: distribution.previous.top3, desc: 'Highest click-through rate', kwKey: 'top3' as const },
            { key: 'pos4to10', label: 'Position 4–10', cur: distribution.current.top10 - distribution.current.top3, prev: distribution.previous.top10 - distribution.previous.top3, desc: 'Page 1 — good visibility', kwKey: 'pos4to10' as const },
            { key: 'pos11to20', label: 'Position 11–20', cur: distribution.current.top20 - distribution.current.top10, prev: distribution.previous.top20 - distribution.previous.top10, desc: 'Striking distance — close to page 1', kwKey: 'pos11to20' as const },
            { key: 'pos21to50', label: 'Position 21–50', cur: distribution.current.top50 - distribution.current.top20, prev: distribution.previous.top50 - distribution.previous.top20, desc: 'Visible but low clicks', kwKey: 'pos21to50' as const },
          ].map((row) => {
            const pct = distribution.current.total > 0 ? (row.cur / distribution.current.total) * 100 : 0
            const isOpen = expandedRange === row.key
            const kws: any[] = (data as any).topKwsByRange?.[row.kwKey] ?? []
            const diff = row.cur - row.prev
            return (
              <div key={row.key}>
                <button onClick={() => setExpandedRange(isOpen ? null : row.key)} className="w-full text-left">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <span className="text-xs font-medium">{row.label}</span>
                      <span className="text-[10px] text-muted-foreground hidden md:inline">{row.desc}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{row.cur} <span className="text-[10px] font-normal text-muted-foreground">keywords</span></span>
                      {diff !== 0 && (
                        <span className={`text-[10px] font-medium ${diff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {diff > 0 ? '+' : ''}{diff} vs prev
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden ml-5">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </button>
                {isOpen && kws.length > 0 && (
                  <div className="mt-2 ml-5 space-y-0.5">
                    <div className="text-[10px] text-muted-foreground mb-1">Top keywords by impressions (of {row.cur} total):</div>
                    {kws.map((kw: any, i: number) => {
                      const path = kw.page ? (() => { try { return new URL(kw.page).pathname } catch { return kw.page } })() : null
                      return (
                        <div key={i} className="flex items-center gap-3 rounded bg-surface-2/30 px-3 py-1.5 text-xs">
                          <span className="font-bold text-brand w-7 text-center">#{Math.round(kw.position)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium truncate">{kw.query}</span>
                              {kw.inContentMap && <span className="rounded bg-brand/20 text-brand px-1 py-0 text-[8px] font-medium flex-shrink-0">In Content Map</span>}
                              {kw.isHomepage && <span className="rounded bg-amber-500/20 text-amber-300 px-1 py-0 text-[8px] font-medium flex-shrink-0">Homepage</span>}
                            </div>
                            {path && (
                              <span className="text-[10px] text-muted-foreground truncate block">
                                {path}
                                {kw.isHomepage && ' — needs dedicated page for better ranking'}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{kw.impressions.toLocaleString()} impr · {kw.clicks} clicks</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 ml-5">
            <span className="text-xs font-medium text-muted-foreground">Total keywords ranking</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{distribution.current.total}</span>
              {(() => { const d = distribution.current.total - distribution.previous.total; return d !== 0 && <span className={`text-[10px] font-medium ${d > 0 ? 'text-green-400' : 'text-red-400'}`}>{d > 0 ? '+' : ''}{d} vs prev</span> })()}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand/20 text-brand px-1.5 py-0.5 text-[8px] font-medium">In Content Map</span>
            <span>This keyword is part of your content strategy. A dedicated article is planned or published to target it specifically.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[8px] font-medium">Homepage</span>
            <span>Ranking with the homepage instead of a dedicated page. Creating specific content for this keyword will likely improve its position.</span>
          </div>
          <div>
            <span className="text-foreground font-medium">Why are some keywords here but marked &quot;not existing&quot; in Content Map?</span>
            {' '}Your site already appears in Google for these keywords (GSC data), but without a dedicated, optimized page. The Content Map plans new articles to properly target them — a dedicated page almost always ranks better than a homepage or unrelated page.
          </div>
        </div>
      </div>

      {/* ── What's Working ── */}
      {(movement.winners.length > 0 || movement.new.length > 0) && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-400" />What&apos;s Working
            <span className="text-xs font-normal text-muted-foreground">({movement.winners.length} keywords improved, {movement.new.length} new)</span>
          </h3>
          {/* AI Insight */}
          {(data as any).workingInsight && (
            <p className="text-xs text-green-300/80 mb-3 leading-relaxed">{(data as any).workingInsight}</p>
          )}
          <div className="text-[10px] text-muted-foreground mb-1.5">Keywords that moved up 3+ positions vs previous {data.period.days} days:</div>
          <div className="space-y-1">
            {movement.winners.slice(0, 8).map((w: any, i: number) => {
              const path = w.page ? (() => { try { return new URL(w.page).pathname } catch { return w.page } })() : null
              const isHomepage = path === '/' || path === ''
              return (
                <div key={i} className="flex items-center gap-3 rounded bg-green-500/5 px-3 py-1.5 text-xs">
                  <div className="flex-shrink-0 text-center w-16">
                    <div className="text-green-400 font-bold">+{w.change.toFixed(0)} pos</div>
                    <div className="text-[9px] text-muted-foreground">was #{Math.round(w.previousPos)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate">{w.query}</span>
                      {w.inContentMap && <span className="rounded bg-brand/20 text-brand px-1 py-0 text-[8px] font-medium flex-shrink-0">Content Map</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {path}{isHomepage && ' — homepage, dedicated page would rank higher'}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-green-400 font-bold">now #{Math.round(w.currentPos)}</div>
                    <div className="text-[9px] text-muted-foreground">{w.impressions.toLocaleString()} impr · {w.clicks} clicks</div>
                  </div>
                </div>
              )
            })}
          </div>
          {movement.new.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-500/10">
              <div className="text-[10px] text-muted-foreground mb-1">New keywords your site started ranking for ({movement.new.length}):</div>
              <div className="flex flex-wrap gap-1.5">
                {movement.new.slice(0, 10).map((kw: any, i: number) => (
                  <span key={i} className="rounded bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">
                    {kw.query} <span className="text-green-400/60">#{Math.round(kw.position)}</span>
                    {kw.inContentMap && <span className="ml-1 text-brand">★</span>}
                  </span>
                ))}
                {movement.new.length > 10 && <span className="text-[10px] text-muted-foreground">+{movement.new.length - 10} more</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── What Needs Attention ── */}
      {(movement.losers.length > 0 || movement.lost.length > 0 || strikingDistance.length > 0) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-amber-400" />What Needs Attention</h3>
          {/* AI Insight */}
          {(data as any).attentionInsight && (
            <p className="text-xs text-amber-300/80 mb-3 leading-relaxed">{(data as any).attentionInsight}</p>
          )}

          {movement.losers.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowLosers(!showLosers)} className="flex items-center gap-2 text-xs text-red-400 font-medium mb-1.5">
                {showLosers ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <TrendingDown className="h-3 w-3" />{movement.losers.length} keywords dropped 3+ positions vs previous {data.period.days} days
              </button>
              {showLosers && <div className="space-y-1 ml-5">{movement.losers.slice(0, 10).map((l: any, i: number) => {
                const path = l.page ? (() => { try { return new URL(l.page).pathname } catch { return l.page } })() : null
                return (
                  <div key={i} className="flex items-center gap-3 rounded bg-red-500/5 px-3 py-1.5 text-xs">
                    <div className="flex-shrink-0 text-center w-16">
                      <div className="text-red-400 font-bold">{l.change.toFixed(0)} pos</div>
                      <div className="text-[9px] text-muted-foreground">was #{Math.round(l.previousPos)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{l.query}</span>
                        {l.inContentMap && <span className="rounded bg-brand/20 text-brand px-1 py-0 text-[8px] font-medium flex-shrink-0">Content Map</span>}
                      </div>
                      {path && <div className="text-[10px] text-muted-foreground truncate">{path}</div>}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-red-400 font-bold">now #{Math.round(l.currentPos)}</div>
                      <div className="text-[9px] text-muted-foreground">{l.impressions.toLocaleString()} impr</div>
                    </div>
                  </div>
                )
              })}</div>}
            </div>
          )}

          {movement.lost.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-red-400 font-medium mb-1"><ArrowDownRight className="inline h-3 w-3 mr-1" />{movement.lost.length} keywords your site stopped ranking for entirely:</div>
              <div className="flex flex-wrap gap-1.5 ml-5">{movement.lost.slice(0, 8).map((kw: any, i: number) => <span key={i} className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">{kw.query}</span>)}</div>
            </div>
          )}

          {strikingDistance.length > 0 && (
            <div className="mt-3 pt-3 border-t border-amber-500/10">
              <button onClick={() => setShowStriking(!showStriking)} className="flex items-center gap-2 text-xs text-amber-400 font-medium mb-1.5">
                {showStriking ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Crosshair className="h-3 w-3" />{strikingDistance.length} keywords in position 11-20 (page 2) — close to page 1
              </button>
              <div className="text-[10px] text-muted-foreground ml-5 mb-1.5">These keywords are almost on page 1. Optimizing their pages or building internal links could push them into top 10.</div>
              {showStriking && <div className="space-y-1 ml-5">{strikingDistance.map((kw: any, i: number) => {
                const path = kw.page ? (() => { try { return new URL(kw.page).pathname } catch { return kw.page } })() : null
                return (
                  <div key={i} className="flex items-center gap-3 rounded bg-amber-500/5 px-3 py-1.5 text-xs">
                    <span className="font-bold text-amber-400 w-8 text-center">#{Math.round(kw.position)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{kw.query}</span>
                      {path && <span className="text-[10px] text-muted-foreground truncate block">{path}</span>}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{kw.impressions.toLocaleString()} impr · {kw.clicks} clicks</span>
                  </div>
                )
              })}</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Cannibalization Alert ── */}
      {((data as any).cannibalization?.length > 0) && (() => {
        const cannibs: any[] = (data as any).cannibalization
        return (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-400" />Keyword Cannibalization
              <span className="text-xs font-normal text-muted-foreground">({cannibs.length} keywords with multiple pages competing)</span>
            </h3>
            <p className="text-[10px] text-muted-foreground mb-3">
              These keywords have 2+ pages ranking in Google, splitting impressions and confusing Google about which page to show.
              Resolve in <a href={`/brands/${brand.id}/optimize`} className="text-brand hover:underline">Optimize → Cannibalization tab</a>.
            </p>
            <div className="space-y-1.5">
              {cannibs.slice(0, 8).map((c: any, i: number) => (
                <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{c.keyword}</span>
                      {c.inContentMap && <span className="rounded bg-brand/20 text-brand px-1 py-0 text-[8px] font-medium">Content Map</span>}
                    </div>
                    <span className="text-muted-foreground">{c.totalImpressions.toLocaleString()} impr · {c.totalClicks} clicks split across {c.pages.length} pages</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {c.pages.map((p: any, j: number) => (
                      <span key={j} className={`rounded px-2 py-0.5 text-[10px] ${j === 0 ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                        {p.path ?? '/'} #{Math.round(p.position)} ({p.impressions} impr)
                        {j === 0 && ' ← strongest'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {cannibs.length > 8 && <div className="text-[10px] text-muted-foreground text-center">+{cannibs.length - 8} more cannibalized keywords</div>}
            </div>
          </div>
        )
      })()}

      {/* ── Impact of Our Work ── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Impact of Our Work</h3>
        <p className="text-[10px] text-muted-foreground mb-3">Keywords from your Content Map strategy and how they are performing in Google.</p>

        {/* Target Keywords from Content Map */}
        {targetKeywords.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setShowTargetKws(!showTargetKws)} className="flex items-center gap-2 text-xs font-medium mb-2">
              {showTargetKws ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Target className="h-3 w-3 text-brand" />Target Keywords — {targetKeywords.filter((k: any) => k.currentPos).length} of {targetKeywords.length} ranking in Google
            </button>
            {showTargetKws && (
              <div className="space-y-1 ml-5">
                <div className="text-[10px] text-muted-foreground mb-1.5">These are the keywords your Content Map targets. Position shows where they rank now, change is vs previous {data.period.days} days.</div>
                {targetKeywords.slice(0, 20).map((kw: any, i: number) => {
                  const isHomepage = kw.currentPos && (() => { try { return !kw.history?.[0]?.page || new URL(kw.history[0].page).pathname === '/' } catch { return false } })()
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs rounded-lg bg-surface-2/30 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{kw.keyword}</span>
                          {isHomepage && <span className="rounded bg-amber-500/20 text-amber-300 px-1 py-0 text-[8px] font-medium flex-shrink-0">Homepage</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate block">{kw.title}</span>
                      </div>
                      {kw.currentPos ? (
                        <div className="flex items-center gap-2 flex-shrink-0 text-right">
                          <div>
                            <span className={`font-bold ${kw.currentPos <= 10 ? 'text-green-400' : kw.currentPos <= 20 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                              #{kw.currentPos.toFixed(0)}
                            </span>
                            {kw.change !== null && kw.change !== 0 && (
                              <span className={`text-[10px] ml-1 ${kw.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {kw.change > 0 ? '↑' : '↓'}{Math.abs(kw.change).toFixed(0)} pos
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground w-16 text-right">{kw.clicks} clicks</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Not ranking yet</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Published Content */}
        {contentPerformance.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setShowContent(!showContent)} className="flex items-center gap-2 text-xs font-medium mb-2">
              {showContent ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <FileText className="h-3 w-3 text-brand" />
              Published Content — {contentPerformance.filter((c: any) => c.status === 'ranking').length} of {contentPerformance.length} in top 10
            </button>
            {showContent && (
              <div className="space-y-1 ml-5">
                <div className="text-[10px] text-muted-foreground mb-1.5">Articles published from your Content Map. Shows current Google position for the target keyword.</div>
                {contentPerformance.sort((a: any, b: any) => b.clicks - a.clicks).map((p: any, i: number) => {
                  const colors: Record<string, string> = { ranking: 'text-green-400', striking_distance: 'text-amber-400', low: 'text-red-300', not_ranking: 'text-muted-foreground' }
                  const labels: Record<string, string> = { ranking: 'Top 10', striking_distance: 'Page 2', low: 'Page 3+', not_ranking: 'Not ranking' }
                  const clicksDelta = p.clicks - (p.prevClicks ?? 0)
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs rounded-lg bg-surface-2/30 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{p.title}</span>
                        <div className="text-[10px] text-muted-foreground truncate">
                          Keyword: {p.targetKeyword}
                          {p.existingUrl && <> · <span className="text-brand">{(() => { try { return new URL(p.existingUrl).pathname } catch { return p.existingUrl } })()}</span></>}
                          {p.daysLive > 0 && ` · ${p.daysLive} days live`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {p.currentPosition && <span className="font-bold">#{p.currentPosition.toFixed(0)}</span>}
                        {clicksDelta !== 0 && <span className={`text-[10px] ${clicksDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>{clicksDelta > 0 ? '+' : ''}{clicksDelta} clicks vs prev</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${colors[p.status]} ${p.status === 'ranking' ? 'bg-green-500/20' : p.status === 'striking_distance' ? 'bg-amber-500/20' : p.status === 'low' ? 'bg-red-500/20' : 'bg-surface-2'}`}>
                          {labels[p.status]}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {contentPerformance.filter((c: any) => c.status === 'not_ranking' && c.daysLive >= 60).length > 0 && (
                  <div className="mt-2 rounded-lg bg-red-500/5 border border-red-500/20 p-2 text-[10px] text-red-300">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    {contentPerformance.filter((c: any) => c.status === 'not_ranking' && c.daysLive >= 60).length} pieces published 60+ days ago still not ranking — consider optimizing title, adding internal links, or checking if indexed.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Execution progress */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 mt-3 pt-3 border-t border-border/50">
          <div>
            <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">Content Map</span><span className="font-medium">{execution.content.published}/{execution.content.total} published</span></div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${execution.content.total > 0 ? (execution.content.published / execution.content.total) * 100 : 0}%` }} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">AEO Actions</span><span className="font-medium">{execution.aeo.done}/{execution.aeo.total} completed</span></div>
            <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${execution.aeo.total > 0 ? (execution.aeo.done / execution.aeo.total) * 100 : 0}%` }} /></div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="rounded-lg border border-border bg-card p-3 text-[10px] text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-brand" />
          <div>
            Data from Google Search Console (3-day delay). Results are cached for 6 hours — click Refresh to get fresh data from GSC (uses AI tokens for the summary).
            A weekly snapshot is saved automatically, building your performance history over time. Traffic Value = clicks × CPC per keyword.
            {(data as any).cached && (data as any).generatedAt && <> · <span className="text-brand">Cached — generated {new Date((data as any).generatedAt).toLocaleString()}</span></>}
          </div>
        </div>
      </div>
    </div>
  )
}
