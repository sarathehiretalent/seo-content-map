'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Minus, Loader2, ArrowUpRight, ArrowDownRight, Target, DollarSign, Eye, MousePointerClick, Hash, ChevronDown, ChevronRight, FileText, ListChecks, Crosshair } from 'lucide-react'

type Period = 7 | 14 | 28 | 90
type MovementTab = 'winners' | 'losers' | 'new' | 'lost'
type MainTab = 'overview' | 'keywords' | 'content' | 'execution'

interface PerformanceData {
  period: { days: number; currentStart: string; currentEnd: string; previousStart: string; previousEnd: string }
  overview: {
    current: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number; totalPages: number }
    previous: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number; totalPages: number }
    trafficValue: { current: number; previous: number }
  }
  distribution: {
    current: { top3: number; top10: number; top20: number; top50: number; total: number }
    previous: { top3: number; top10: number; top20: number; top50: number; total: number }
  }
  movement: {
    winners: Array<{ query: string; page?: string; currentPos: number; previousPos: number; change: number; clicks: number; impressions: number }>
    losers: Array<{ query: string; page?: string; currentPos: number; previousPos: number; change: number; clicks: number; impressions: number }>
    new: Array<{ query: string; page?: string; position: number; clicks: number; impressions: number }>
    lost: Array<{ query: string; page?: string; position: number; clicks: number; impressions: number }>
  }
  strikingDistance: Array<{ query: string; page?: string; position: number; impressions: number; clicks: number }>
  contentPerformance: Array<{
    title: string; targetKeyword: string; publishedDate: string | null
    currentPosition: number | null; clicks: number; impressions: number; ctr: number
    status: string; daysLive: number
  }>
  execution: { content: { total: number; published: number }; aeo: { total: number; done: number } }
  trend: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>
}

function delta(current: number, previous: number): { value: number; pct: number; direction: 'up' | 'down' | 'flat' } {
  const diff = current - previous
  const pct = previous === 0 ? (current > 0 ? 100 : 0) : (diff / previous) * 100
  return { value: diff, pct, direction: Math.abs(pct) < 1 ? 'flat' : diff > 0 ? 'up' : 'down' }
}

function DeltaBadge({ d, invert = false }: { d: ReturnType<typeof delta>; invert?: boolean }) {
  const isGood = invert ? d.direction === 'down' : d.direction === 'up'
  if (d.direction === 'flat') return <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${isGood ? 'text-green-400' : 'text-red-400'}`}>
      {d.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(d.pct).toFixed(1)}%
    </span>
  )
}

function DistBar({ label, current, previous, total }: { label: string; current: number; previous: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0
  const d = delta(current, previous)
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-12">{label}</span>
      <div className="flex-1 h-4 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-sm font-bold w-10 text-right">{current}</span>
      <DeltaBadge d={d} />
    </div>
  )
}

// Simple sparkline using SVG
function Sparkline({ data, width = 120, height = 30 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ')
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
    </svg>
  )
}

export function PerformanceClient({ brand }: { brand: { id: string; domain: string; gscProperty: string | null } }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PerformanceData | null>(null)
  const [period, setPeriod] = useState<Period>(28)
  const [mainTab, setMainTab] = useState<MainTab>('overview')
  const [movementTab, setMovementTab] = useState<MovementTab>('winners')
  const [expandedStriking, setExpandedStriking] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/performance?brandId=${brand.id}&period=${p}`)
      const result = await res.json()
      if (result.error) setError(result.error)
      else setData(result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load performance data') }
    setLoading(false)
  }, [brand.id])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  if (!brand.gscProperty) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">GSC Not Connected</h3>
          <p className="mt-2 text-sm text-muted-foreground">Connect Google Search Console in Settings to see performance data.</p>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading GSC data for 2 periods...</span></div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <h3 className="text-lg font-semibold text-red-400">Error Loading Performance Data</h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button onClick={() => fetchData(period)} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { overview, distribution, movement, trend, strikingDistance, contentPerformance, execution } = data

  const clicksDelta = delta(overview.current.totalClicks, overview.previous.totalClicks)
  const impressionsDelta = delta(overview.current.totalImpressions, overview.previous.totalImpressions)
  const ctrDelta = delta(overview.current.avgCtr, overview.previous.avgCtr)
  const positionDelta = delta(overview.current.avgPosition, overview.previous.avgPosition)
  const tvDelta = delta(overview.trafficValue.current, overview.trafficValue.previous)
  const top10Delta = delta(distribution.current.top10, distribution.previous.top10)

  // Trend data for sparklines
  const clicksTrend = trend.map((d) => d.clicks)
  const impressionsTrend = trend.map((d) => d.impressions)

  const movementItems = movementTab === 'winners' ? movement.winners : movementTab === 'losers' ? movement.losers : movementTab === 'new' ? movement.new : movement.lost

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance</h2>
          <p className="text-sm text-muted-foreground">
            {data.period.currentStart} to {data.period.currentEnd} vs {data.period.previousStart} to {data.period.previousEnd}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {([7, 14, 28, 90] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 font-medium ${period === p ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
                {p}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Score cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={clicksDelta} />
          </div>
          <div className="text-xl font-bold">{overview.current.totalClicks.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Clicks</div>
          <Sparkline data={clicksTrend} width={100} height={20} />
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={impressionsDelta} />
          </div>
          <div className="text-xl font-bold">{overview.current.totalImpressions.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Impressions</div>
          <Sparkline data={impressionsTrend} width={100} height={20} />
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={ctrDelta} />
          </div>
          <div className="text-xl font-bold">{(overview.current.avgCtr * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground">Avg CTR</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={positionDelta} invert />
          </div>
          <div className="text-xl font-bold">{overview.current.avgPosition.toFixed(1)}</div>
          <div className="text-[10px] text-muted-foreground">Avg Position</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={top10Delta} />
          </div>
          <div className="text-xl font-bold">{distribution.current.top10}</div>
          <div className="text-[10px] text-muted-foreground">Top 10 KWs</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <DeltaBadge d={tvDelta} />
          </div>
          <div className="text-xl font-bold">${overview.trafficValue.current.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">Traffic Value</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex rounded-lg border border-border overflow-hidden w-fit text-xs">
        {([
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'keywords', label: 'Keywords', icon: TrendingUp },
          { key: 'content', label: 'Content', icon: FileText },
          { key: 'execution', label: 'Execution', icon: ListChecks },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${mainTab === t.key ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
            <t.icon className="h-3 w-3" />{t.label}
          </button>
        ))}
      </div>

      {/* ═══ Overview Tab ═══ */}
      {mainTab === 'overview' && (
        <div className="space-y-5">
          {/* Trend chart (simplified — bars) */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Traffic Trend (Last 90 days)</h3>
            <div className="flex items-end gap-[2px] h-32">
              {trend.map((d, i) => {
                const maxClicks = Math.max(...trend.map((t) => t.clicks), 1)
                const h = (d.clicks / maxClicks) * 100
                const isCurrentPeriod = d.date >= data.period.currentStart
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
                    <div className={`w-full rounded-t-sm transition-colors ${isCurrentPeriod ? 'bg-brand' : 'bg-brand/30'}`}
                      style={{ height: `${Math.max(h, 1)}%` }} />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover border border-border rounded px-2 py-1 text-[9px] whitespace-nowrap z-10">
                      {d.date}: {d.clicks} clicks, {d.impressions} impr
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
              <span>{trend[0]?.date}</span>
              <span>{trend[trend.length - 1]?.date}</span>
            </div>
          </div>

          {/* Ranking distribution */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Ranking Distribution</h3>
            <div className="space-y-2">
              <DistBar label="Top 3" current={distribution.current.top3} previous={distribution.previous.top3} total={distribution.current.total} />
              <DistBar label="Top 10" current={distribution.current.top10} previous={distribution.previous.top10} total={distribution.current.total} />
              <DistBar label="Top 20" current={distribution.current.top20} previous={distribution.previous.top20} total={distribution.current.total} />
              <DistBar label="Top 50" current={distribution.current.top50} previous={distribution.previous.top50} total={distribution.current.total} />
              <DistBar label="Total" current={distribution.current.total} previous={distribution.previous.total} total={distribution.current.total} />
            </div>
          </div>

          {/* Striking distance */}
          {strikingDistance.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <button onClick={() => setExpandedStriking(!expandedStriking)} className="w-full flex items-center justify-between text-left">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-amber-400" />
                    Striking Distance ({strikingDistance.length})
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Keywords in positions 11-20 with high impressions — push to top 10</p>
                </div>
                {expandedStriking ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandedStriking && (
                <div className="mt-3 space-y-1">
                  {strikingDistance.map((kw) => (
                    <div key={kw.query} className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2 text-xs">
                      <span className="font-bold text-amber-400 w-8 text-center">{Math.round(kw.position)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{kw.query}</div>
                        {kw.page && <div className="text-[10px] text-muted-foreground truncate">{new URL(kw.page).pathname}</div>}
                      </div>
                      <div className="text-right text-muted-foreground flex-shrink-0">
                        <div>{kw.impressions.toLocaleString()} impr</div>
                        <div>{kw.clicks} clicks</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Keywords Tab ═══ */}
      {mainTab === 'keywords' && (
        <div className="space-y-4">
          {/* Movement summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {([
              { key: 'winners' as const, label: 'Winners', count: movement.winners.length, color: 'text-green-400', icon: TrendingUp },
              { key: 'losers' as const, label: 'Losers', count: movement.losers.length, color: 'text-red-400', icon: TrendingDown },
              { key: 'new' as const, label: 'New', count: movement.new.length, color: 'text-brand', icon: ArrowUpRight },
              { key: 'lost' as const, label: 'Lost', count: movement.lost.length, color: 'text-red-400', icon: ArrowDownRight },
            ]).map((m) => (
              <button key={m.key} onClick={() => setMovementTab(m.key)}
                className={`rounded-lg p-3 text-center border transition-all ${movementTab === m.key ? 'border-brand ring-1 ring-brand bg-card' : 'border-transparent bg-card'}`}>
                <m.icon className={`h-4 w-4 mx-auto mb-1 ${m.color}`} />
                <div className={`text-xl font-bold ${m.color}`}>{m.count}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </button>
            ))}
          </div>

          {/* Movement list */}
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-2 border-b border-border">
              <h3 className="text-sm font-semibold">
                {movementTab === 'winners' ? 'Improved 3+ positions' : movementTab === 'losers' ? 'Dropped 3+ positions' : movementTab === 'new' ? 'Newly ranking keywords' : 'Lost rankings'}
              </h3>
            </div>
            <div className="divide-y divide-border">
              {movementItems.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">No keywords in this category</div>}
              {movementItems.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                  {(movementTab === 'winners' || movementTab === 'losers') && (
                    <span className={`font-bold w-12 text-center ${item.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}
                    </span>
                  )}
                  {(movementTab === 'new' || movementTab === 'lost') && (
                    <span className="font-bold w-12 text-center text-muted-foreground">#{Math.round(item.position)}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.query}</div>
                    {item.page && <div className="text-[10px] text-muted-foreground truncate">{new URL(item.page).pathname}</div>}
                  </div>
                  {(movementTab === 'winners' || movementTab === 'losers') && (
                    <div className="text-right text-muted-foreground flex-shrink-0 text-[10px]">
                      <div>{Math.round(item.previousPos)} → {Math.round(item.currentPos)}</div>
                    </div>
                  )}
                  <div className="text-right text-muted-foreground flex-shrink-0 w-20">
                    <div>{item.impressions.toLocaleString()} impr</div>
                    <div>{item.clicks} clicks</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Content Tab ═══ */}
      {mainTab === 'content' && (
        <div className="space-y-4">
          {/* Content status summary */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-card border border-border p-3 text-center">
              <div className="text-xl font-bold">{contentPerformance.length}</div>
              <div className="text-xs text-muted-foreground">Published</div>
            </div>
            <div className="rounded-lg bg-card border border-border p-3 text-center">
              <div className="text-xl font-bold text-green-400">{contentPerformance.filter((c) => c.status === 'ranking').length}</div>
              <div className="text-xs text-muted-foreground">Ranking (Top 10)</div>
            </div>
            <div className="rounded-lg bg-card border border-border p-3 text-center">
              <div className="text-xl font-bold text-amber-400">{contentPerformance.filter((c) => c.status === 'striking_distance').length}</div>
              <div className="text-xs text-muted-foreground">Striking Dist.</div>
            </div>
            <div className="rounded-lg bg-card border border-border p-3 text-center">
              <div className="text-xl font-bold text-red-400">{contentPerformance.filter((c) => c.status === 'not_ranking').length}</div>
              <div className="text-xs text-muted-foreground">Not Ranking</div>
            </div>
          </div>

          {/* Content list */}
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-2 border-b border-border">
              <h3 className="text-sm font-semibold">Content Performance</h3>
              <p className="text-[10px] text-muted-foreground">Published pieces from Content Map matched with GSC data</p>
            </div>
            <div className="divide-y divide-border">
              {contentPerformance.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">No published content yet. Publish pieces in Content Map first.</div>}
              {contentPerformance.sort((a, b) => b.clicks - a.clicks).map((piece, i) => {
                const statusColors: Record<string, string> = {
                  ranking: 'bg-green-500/20 text-green-300',
                  striking_distance: 'bg-amber-500/20 text-amber-300',
                  low: 'bg-red-500/20 text-red-300',
                  not_ranking: 'bg-surface-2 text-muted-foreground',
                }
                const statusLabels: Record<string, string> = {
                  ranking: 'Top 10', striking_distance: 'Pos 11-20', low: 'Pos 20+', not_ranking: 'Not ranking',
                }
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{piece.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {piece.targetKeyword}
                        {piece.publishedDate && ` · Published ${piece.publishedDate}`}
                        {piece.daysLive > 0 && ` · ${piece.daysLive}d live`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {piece.currentPosition !== null && (
                        <div className="text-center">
                          <div className="font-bold">{piece.currentPosition.toFixed(1)}</div>
                          <div className="text-[9px] text-muted-foreground">Pos</div>
                        </div>
                      )}
                      <div className="text-center">
                        <div className="font-bold">{piece.clicks}</div>
                        <div className="text-[9px] text-muted-foreground">Clicks</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold">{piece.impressions.toLocaleString()}</div>
                        <div className="text-[9px] text-muted-foreground">Impr</div>
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${statusColors[piece.status]}`}>
                        {statusLabels[piece.status]}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Flag: not ranking after 60+ days */}
          {contentPerformance.filter((c) => c.status === 'not_ranking' && c.daysLive >= 60).length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <h4 className="text-sm font-semibold text-red-400 mb-2">Needs Investigation</h4>
              <p className="text-xs text-muted-foreground mb-2">Published 60+ days ago but not ranking — may need optimization or re-indexing.</p>
              <div className="space-y-1">
                {contentPerformance.filter((c) => c.status === 'not_ranking' && c.daysLive >= 60).map((piece, i) => (
                  <div key={i} className="text-xs text-red-300">{piece.title} ({piece.daysLive}d live, kw: {piece.targetKeyword})</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Execution Tab ═══ */}
      {mainTab === 'execution' && (
        <div className="space-y-5">
          {/* Content Map progress */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Content Map</h3>
            <div className="flex items-center gap-4 mb-2">
              <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${execution.content.total > 0 ? (execution.content.published / execution.content.total) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold">{execution.content.published}/{execution.content.total}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {execution.content.published} published, {execution.content.total - execution.content.published} remaining
            </p>
          </div>

          {/* AEO Actions progress */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">AEO Actions</h3>
            <div className="flex items-center gap-4 mb-2">
              <div className="flex-1 h-3 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${execution.aeo.total > 0 ? (execution.aeo.done / execution.aeo.total) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-bold">{execution.aeo.done}/{execution.aeo.total}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {execution.aeo.done} completed, {execution.aeo.total - execution.aeo.done} pending
            </p>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Period Summary</h3>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Organic clicks change</span>
                <span className={clicksDelta.direction === 'up' ? 'text-green-400 font-medium' : clicksDelta.direction === 'down' ? 'text-red-400 font-medium' : ''}>
                  {clicksDelta.value > 0 ? '+' : ''}{clicksDelta.value.toLocaleString()} ({clicksDelta.pct > 0 ? '+' : ''}{clicksDelta.pct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Impressions change</span>
                <span className={impressionsDelta.direction === 'up' ? 'text-green-400 font-medium' : impressionsDelta.direction === 'down' ? 'text-red-400 font-medium' : ''}>
                  {impressionsDelta.value > 0 ? '+' : ''}{impressionsDelta.value.toLocaleString()} ({impressionsDelta.pct > 0 ? '+' : ''}{impressionsDelta.pct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Keywords gained / lost</span>
                <span><span className="text-green-400">+{movement.new.length}</span> / <span className="text-red-400">-{movement.lost.length}</span></span>
              </div>
              <div className="flex justify-between">
                <span>Keywords improved / dropped</span>
                <span><span className="text-green-400">{movement.winners.length} up</span> / <span className="text-red-400">{movement.losers.length} down</span></span>
              </div>
              <div className="flex justify-between">
                <span>Traffic value change</span>
                <span className={tvDelta.direction === 'up' ? 'text-green-400 font-medium' : tvDelta.direction === 'down' ? 'text-red-400 font-medium' : ''}>
                  {tvDelta.value >= 0 ? '+' : ''}${tvDelta.value.toFixed(2)} ({tvDelta.pct > 0 ? '+' : ''}{tvDelta.pct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
