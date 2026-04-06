'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Eye, MousePointerClick, BarChart3,
  FileText, Stethoscope, Map, ArrowRight, Globe, Target,
  Zap, Bot, FileCheck, FileX,
} from 'lucide-react'

interface TopKeyword {
  query: string
  position: number
  searchVolume: number | null
  pageUrl: string | null
  clicks: number
  impressions: number
}

interface Stats {
  totalKeywords: number
  totalClicks: number
  totalImpressions: number
  avgPosition: number
  totalVolume: number
  top3: number
  top10: number
  sitePages: number
  diagnostics: number
  contentMaps: number
  lastDiagStatus: string | null
  lastMapStatus: string | null
}

interface GscOverview {
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  totalPages: number
}

interface Props {
  brand: { id: string; name: string; domain: string; gscProperty: string | null }
  topKeywords: TopKeyword[]
  stats: Stats
}

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '28d', days: 28 },
  { label: '3m', days: 90 },
  { label: '6m', days: 180 },
]

export function OverviewClient({ brand, topKeywords, stats }: Props) {
  const [gsc, setGsc] = useState<GscOverview | null>(null)
  const [gscLoading, setGscLoading] = useState(false)
  const [dateRange, setDateRange] = useState(28)
  const [sitemapTotal, setSitemapTotal] = useState<number | null>(null)

  useEffect(() => {
    if (brand.gscProperty) loadGsc(dateRange)
    loadSitemap()
  }, [brand.gscProperty, dateRange])

  async function loadGsc(days: number) {
    if (!brand.gscProperty) return
    setGscLoading(true)
    try {
      const end = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
      const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
      const res = await fetch(`/api/gsc/overview?siteUrl=${encodeURIComponent(brand.gscProperty)}&startDate=${start}&endDate=${end}`)
      if (res.ok) setGsc(await res.json())
    } catch { /* ignore */ }
    setGscLoading(false)
  }

  async function loadSitemap() {
    try {
      const res = await fetch(`/api/sitemap?domain=${brand.domain}`)
      if (res.ok) {
        const data = await res.json()
        setSitemapTotal(data.totalUrls)
      }
    } catch { /* ignore */ }
  }

  const hasData = stats.totalKeywords > 0
  const displayClicks = gsc?.totalClicks ?? stats.totalClicks
  const displayImpressions = gsc?.totalImpressions ?? stats.totalImpressions
  const displayAvgPos = gsc?.avgPosition ?? stats.avgPosition
  const displayCtr = gsc?.avgCtr ?? (stats.totalImpressions > 0 ? stats.totalClicks / stats.totalImpressions : 0)
  const gscPages = gsc?.totalPages ?? 0

  // Indexation estimate: sitemap total vs pages with impressions in GSC
  const sitemapCount = sitemapTotal ?? stats.sitePages
  const indexedEstimate = gscPages > 0 ? gscPages : null
  const notIndexedEstimate = sitemapCount > 0 && indexedEstimate != null ? Math.max(0, sitemapCount - indexedEstimate) : null

  return (
    <div className="p-6">
      {/* Header with date range */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-sm text-muted-foreground">{brand.domain}</p>
        </div>
        {brand.gscProperty && (
          <div className="flex items-center gap-1 rounded-lg border border-border overflow-hidden">
            {DATE_RANGES.map((r) => (
              <button key={r.days} onClick={() => setDateRange(r.days)}
                className={`px-3 py-1.5 text-xs font-medium ${dateRange === r.days ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Performance metrics row */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={MousePointerClick} label="Clicks" value={displayClicks.toLocaleString()} color="text-brand" loading={gscLoading} />
        <MetricCard icon={Eye} label="Impressions" value={displayImpressions.toLocaleString()} color="text-blue-400" loading={gscLoading} />
        <MetricCard icon={BarChart3} label="Avg Position"
          value={displayAvgPos > 0 ? displayAvgPos.toFixed(1) : '—'}
          color={displayAvgPos > 0 && displayAvgPos <= 10 ? 'text-green-400' : displayAvgPos <= 20 ? 'text-amber-400' : 'text-foreground'}
          loading={gscLoading} />
        <MetricCard icon={Target} label="CTR" value={displayCtr > 0 ? `${(displayCtr * 100).toFixed(1)}%` : '—'} color="text-purple-400" loading={gscLoading} />
      </div>

      {/* Keywords + Indexation row */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard icon={Globe} label="Total Keywords" value={String(stats.totalKeywords)} color="text-foreground" />
        <MetricCard icon={Target} label="Top 3" value={String(stats.top3)} color="text-green-400" sub={`of ${stats.totalKeywords}`} />
        <MetricCard icon={BarChart3} label="Top 10" value={String(stats.top10)} color="text-amber-400" sub={`of ${stats.totalKeywords}`} />
        <MetricCard icon={FileCheck} label="In Sitemap" value={sitemapCount > 0 ? String(sitemapCount) : '—'} color="text-foreground"
          sub={indexedEstimate != null ? `~${indexedEstimate} with traffic` : undefined} />
        <MetricCard icon={FileText} label="Pages in GSC" value={gscPages > 0 ? String(gscPages) : '—'} color="text-foreground"
          sub={notIndexedEstimate != null && notIndexedEstimate > 0 ? `~${notIndexedEstimate} without traffic` : undefined} loading={gscLoading} />
      </div>

      {/* Two columns */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Top performing keywords — takes 3 cols */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Top Performing Keywords</h3>
            {hasData && (
              <Link href={`/brands/${brand.id}/diagnostic/rankings`} className="text-xs text-brand hover:underline">View all →</Link>
            )}
          </div>
          {topKeywords.length > 0 ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Keyword</th>
                    <th className="px-3 py-2 text-left font-medium">URL</th>
                    <th className="px-2 py-2 text-right font-medium">Impressions</th>
                    <th className="px-2 py-2 text-right font-medium">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {topKeywords.map((kw, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-surface-2/30">
                      <td className="px-3 py-1.5 font-medium">{kw.query}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">
                        {kw.pageUrl?.replace(/^https?:\/\/[^/]+/, '') ?? ''}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">{kw.impressions.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{kw.clicks > 0 ? kw.clicks.toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
              <Globe className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Run a diagnostic to see top keywords</p>
            </div>
          )}
        </div>

        {/* Workflow — takes 2 cols */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-medium mb-3">Workflow</h3>
          <div className="space-y-2">
            {[
              { step: 1, title: 'Brand Analysis', desc: 'Deep research on your brand', href: `/brands/${brand.id}/settings`, icon: Globe,
                done: stats.diagnostics > 0 },
              { step: 2, title: 'Diagnostic', desc: 'Rankings, SERP, structure', href: `/brands/${brand.id}/diagnostic`, icon: Stethoscope,
                done: stats.lastDiagStatus === 'completed', active: !!stats.lastDiagStatus && stats.lastDiagStatus !== 'completed' && stats.lastDiagStatus !== 'failed' },
              { step: 3, title: 'Optimize', desc: 'Page audit & quick wins', href: `/brands/${brand.id}/optimize`, icon: Zap,
                locked: stats.lastDiagStatus !== 'completed' },
              { step: 4, title: 'Content Map', desc: 'Pillar/cluster strategy', href: `/brands/${brand.id}/content-map`, icon: Map,
                locked: stats.lastDiagStatus !== 'completed' },
              { step: 5, title: 'AEO', desc: 'Answer Engine Optimization', href: `/brands/${brand.id}/aoe`, icon: Bot,
                locked: stats.lastDiagStatus !== 'completed' },
              { step: 6, title: 'Performance', desc: 'Track results & ROI', href: `/brands/${brand.id}/performance`, icon: BarChart3,
                locked: stats.lastDiagStatus !== 'completed' },
            ].map((s) => (
              <Link key={s.step} href={s.href}
                className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                  s.done ? 'border-green-500/30 bg-green-500/5' : s.locked ? 'border-border opacity-50' : 'border-border hover:border-brand/30'
                }`}>
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  s.done ? 'bg-green-500/20 text-green-400' : s.active ? 'bg-brand/20 text-brand' : 'bg-surface-2 text-muted-foreground'
                }`}>
                  {s.done ? '✓' : s.step}
                </div>
                <s.icon className={`h-3.5 w-3.5 ${s.done ? 'text-green-400' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{s.title}</div>
                  <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* GSC prompt */}
      {!brand.gscProperty && (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-400">Connect Google Search Console</p>
            <p className="text-xs text-muted-foreground">Get real clicks, impressions, CTR, and position data</p>
          </div>
          <Link href={`/brands/${brand.id}/settings`} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90">
            Connect
          </Link>
        </div>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color, sub, loading }: {
  icon: typeof Eye
  label: string
  value: string
  color: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color} ${loading ? 'animate-pulse' : ''}`}>
        {loading ? '...' : value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
