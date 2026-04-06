'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown, Download, AlertTriangle, Link as LinkIcon, Search, Star, ChevronDown, ChevronRight } from 'lucide-react'
import { INTENT_COLORS } from '@/lib/constants'
import type { SearchIntent } from '@/lib/constants'

interface Keyword {
  id: string
  query: string
  position: number
  clicks: number
  impressions: number
  ctr: number
  searchVolume: number | null
  kd: number | null
  cpc: number | null
  competition: number | null
  competitionLevel: string | null
  intent: string | null
  source: string
  pageUrl: string | null
}

interface CannibalizationItem {
  keyword: string
  pages: string[]
  recommendation: string
}

type SortKey = 'query' | 'position' | 'clicks' | 'impressions' | 'ctr' | 'searchVolume' | 'kd' | 'cpc'
type SortDir = 'asc' | 'desc'
type PositionFilter = 'all' | '1-3' | '4-10' | '11-20' | '21-50' | '51+' | 'quickwins'
type PageSort = 'bestPosition' | 'totalImpressions' | 'keywordCount' | 'totalClicks'
type ViewMode = 'keywords' | 'pages'

interface Props {
  brand: { id: string; domain: string }
  keywords: Keyword[]
  cannibalization: CannibalizationItem[]
  sitemapTotal?: number
}

export function RankingsClient({ brand, keywords, cannibalization, sitemapTotal }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('impressions')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [posFilter, setPosFilter] = useState<PositionFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('keywords')
  const [pageSort, setPageSort] = useState<PageSort>('totalImpressions')
  const [exporting, setExporting] = useState(false)
  const [showCannibalization, setShowCannibalization] = useState(false)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())

  const getCannibalizationInfo = (query: string): CannibalizationItem | undefined =>
    cannibalization.find((c) => c.keyword.toLowerCase() === query.toLowerCase())

  const togglePage = (url: string) => {
    const next = new Set(expandedPages)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    setExpandedPages(next)
  }

  // Quick wins: pos 4-20 with real impressions
  const quickWins = useMemo(() =>
    keywords
      .filter((k) => k.position > 3 && k.position <= 20 && k.impressions > 10 && (k.kd == null || k.kd < 50))
      .sort((a, b) => b.impressions - a.impressions),
  [keywords])

  // Pages view — primary keyword by IMPRESSIONS not volume
  const pageGroups = useMemo(() => {
    const groups: Record<string, Keyword[]> = {}
    keywords.forEach((k) => {
      const url = k.pageUrl ?? 'Unknown'
      if (!groups[url]) groups[url] = []
      groups[url].push(k)
    })
    const pages = Object.entries(groups).map(([url, kws]) => {
      // Primary keyword = highest impressions (the keyword driving the most visibility)
      const byImpressions = [...kws].sort((a, b) => b.impressions - a.impressions)
      const positions = kws.map((k) => k.position).filter((p) => p > 0)
      return {
        url,
        keywords: byImpressions, // sorted by impressions
        primaryKeyword: byImpressions[0]?.query ?? '',
        primaryImpressions: byImpressions[0]?.impressions ?? 0,
        totalClicks: kws.reduce((s, k) => s + k.clicks, 0),
        totalImpressions: kws.reduce((s, k) => s + k.impressions, 0),
        bestPosition: Math.min(...positions, 999),
        avgPosition: positions.length > 0 ? positions.reduce((s, p) => s + p, 0) / positions.length : 999,
        keywordCount: kws.length,
      }
    })
    switch (pageSort) {
      case 'bestPosition': return pages.sort((a, b) => a.bestPosition - b.bestPosition)
      case 'totalImpressions': return pages.sort((a, b) => b.totalImpressions - a.totalImpressions)
      case 'keywordCount': return pages.sort((a, b) => b.keywordCount - a.keywordCount)
      case 'totalClicks': return pages.sort((a, b) => b.totalClicks - a.totalClicks)
      default: return pages
    }
  }, [keywords, pageSort])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir(key === 'query' || key === 'position' ? 'asc' : 'desc') }
  }

  const filtered = useMemo(() => {
    let list = keywords.filter((k) => k.position > 0)
    switch (posFilter) {
      case '1-3': list = list.filter((k) => k.position <= 3); break
      case '4-10': list = list.filter((k) => k.position > 3 && k.position <= 10); break
      case '11-20': list = list.filter((k) => k.position > 10 && k.position <= 20); break
      case '21-50': list = list.filter((k) => k.position > 20 && k.position <= 50); break
      case '51+': list = list.filter((k) => k.position > 50); break
      case 'quickwins': list = quickWins; break
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter((k) => k.query.toLowerCase().includes(q) || (k.pageUrl?.toLowerCase().includes(q) ?? false))
    }
    return list.sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (bv < av ? -1 : bv > av ? 1 : 0)
    })
  }, [keywords, sortKey, sortDir, posFilter, searchQuery, quickWins])

  // Stats
  const withPos = keywords.filter((k) => k.position > 0)
  const range13 = withPos.filter((k) => k.position <= 3)
  const range410 = withPos.filter((k) => k.position > 3 && k.position <= 10)
  const range1120 = withPos.filter((k) => k.position > 10 && k.position <= 20)
  const range2150 = withPos.filter((k) => k.position > 20 && k.position <= 50)
  const range51 = withPos.filter((k) => k.position > 50)
  const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0)
  const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0)
  const uniquePages = new Set(keywords.map((k) => k.pageUrl).filter(Boolean)).size
  const rangeVol = (arr: Keyword[]) => arr.reduce((s, k) => s + (k.searchVolume ?? 0), 0)

  const distTotal = withPos.length || 1
  const distSegments = [
    { range: '1-3', count: range13.length, color: 'bg-green-500' },
    { range: '4-10', count: range410.length, color: 'bg-amber-500' },
    { range: '11-20', count: range1120.length, color: 'bg-blue-500' },
    { range: '21-50', count: range2150.length, color: 'bg-purple-500' },
    { range: '51+', count: range51.length, color: 'bg-red-500' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch('/api/export/diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId: brand.id }) })
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
      else alert(data.error ?? 'Export failed')
    } catch { alert('Export failed.') }
    setExporting(false)
  }

  const SortHeader = ({ label, field, className = '' }: { label: string; field: SortKey; className?: string }) => (
    <th className={`px-3 py-2 font-medium cursor-pointer hover:text-brand select-none whitespace-nowrap ${className}`} onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">{label}<ArrowUpDown className={`h-3 w-3 flex-shrink-0 ${sortKey === field ? 'text-brand' : 'text-muted-foreground/40'}`} /></div>
    </th>
  )

  const filterCards: { key: PositionFilter; label: string; count: number; vol: number; color: string; desc: string }[] = [
    { key: 'all', label: 'All', count: withPos.length, vol: totalImpressions, color: '', desc: `${totalImpressions.toLocaleString()} impr` },
    { key: '1-3', label: 'Pos 1–3', count: range13.length, vol: rangeVol(range13), color: 'border-green-500/40', desc: 'top positions' },
    { key: '4-10', label: 'Pos 4–10', count: range410.length, vol: rangeVol(range410), color: 'border-amber-500/40', desc: 'page 1' },
    { key: '11-20', label: 'Pos 11–20', count: range1120.length, vol: rangeVol(range1120), color: 'border-blue-500/40', desc: 'page 2' },
    { key: '21-50', label: 'Pos 21–50', count: range2150.length, vol: rangeVol(range2150), color: 'border-purple-500/40', desc: 'page 3-5' },
    { key: '51+', label: 'Pos 51+', count: range51.length, vol: rangeVol(range51), color: 'border-red-500/40', desc: 'deep' },
    { key: 'quickwins', label: 'Quick Wins', count: quickWins.length, vol: rangeVol(quickWins), color: 'border-brand/40', desc: 'pos 4-20, high impr' },
  ]

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rankings Diagnostic</h2>
          <p className="text-sm text-muted-foreground">
            {keywords.length} keywords &middot; {uniquePages} pages with traffic &middot; {totalClicks.toLocaleString()} clicks &middot; {totalImpressions.toLocaleString()} impressions
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            All data from Google Search Console (last 90 days) &middot; Volume & KD from DataForSEO
            {sitemapTotal ? ` · ${sitemapTotal} pages in sitemap, ${uniquePages} with search traffic` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button onClick={() => setViewMode('keywords')} className={`px-3 py-1.5 font-medium ${viewMode === 'keywords' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>Keywords</button>
            <button onClick={() => setViewMode('pages')} className={`px-3 py-1.5 font-medium ${viewMode === 'pages' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>Pages</button>
          </div>
          <button onClick={handleExport} disabled={exporting} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />{exporting ? '...' : 'Export'}
          </button>
        </div>
      </div>

      {/* Distribution bar */}
      <div className="mb-4">
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
          {distSegments.map((seg) => seg.count > 0 && (
            <div key={seg.range} className={`${seg.color} transition-all`} style={{ width: `${(seg.count / distTotal) * 100}%` }} />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
          {distSegments.map((seg) => (
            <span key={seg.range} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />{seg.range} ({seg.count})
            </span>
          ))}
        </div>
      </div>

      {/* Filter cards */}
      <div className="mb-3 grid grid-cols-4 gap-2 md:grid-cols-8">
        {filterCards.map((c) => (
          <button key={c.key} onClick={() => setPosFilter(posFilter === c.key ? 'all' : c.key)}
            className={`rounded-lg border bg-card p-2 text-center transition-all ${posFilter === c.key ? 'border-brand ring-1 ring-brand' : c.color || 'border-border'} hover:border-muted-foreground/40`}>
            <div className={`text-base font-bold ${posFilter === c.key ? 'text-brand' : ''}`}>{c.count}</div>
            <div className="text-[10px] font-medium">{c.label}</div>
            <div className="text-[9px] text-muted-foreground">{c.desc}</div>
          </button>
        ))}
        <button onClick={() => setShowCannibalization(!showCannibalization)}
          className={`rounded-lg border bg-card p-2 text-center ${cannibalization.length > 0 ? 'border-red-500/40' : 'border-border'}`}>
          <div className={`text-base font-bold ${cannibalization.length > 0 ? 'text-red-400' : ''}`}>{cannibalization.length}</div>
          <div className="text-[10px] font-medium">Cannibal.</div>
          <div className="text-[9px] text-muted-foreground">conflicts</div>
        </button>
      </div>

      {/* Search */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search keywords or URLs..."
          className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>

      {/* Cannibalization */}
      {showCannibalization && cannibalization.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <h4 className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Keyword Cannibalization</h4>
          <div className="space-y-2">
            {cannibalization.map((c, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-foreground">{c.keyword}</span>
                <span className="text-muted-foreground"> — {c.pages.length} pages:</span>
                <div className="ml-3 mt-0.5">{c.pages.map((p, j) => <div key={j} className="text-muted-foreground truncate">{p}</div>)}</div>
                <div className="ml-3 mt-0.5 text-amber-400">{c.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PAGES VIEW (Accordion) ── */}
      {viewMode === 'pages' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              {([
                { key: 'totalImpressions' as PageSort, label: 'Impressions' },
                { key: 'totalClicks' as PageSort, label: 'Clicks' },
                { key: 'bestPosition' as PageSort, label: 'Best Position' },
                { key: 'keywordCount' as PageSort, label: '# Keywords' },
              ]).map((s) => (
                <button key={s.key} onClick={() => setPageSort(s.key)}
                  className={`rounded px-2 py-1 text-xs font-medium ${pageSort === s.key ? 'bg-brand text-primary-foreground' : 'bg-surface-2 hover:bg-muted'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {pageGroups.length} pages with search traffic{sitemapTotal ? ` of ${sitemapTotal} in sitemap` : ''}
            </p>
          </div>
          <div className="space-y-1">
            {pageGroups.map((pg) => {
              const isOpen = expandedPages.has(pg.url)
              return (
                <div key={pg.url} className="rounded-lg border border-border bg-card overflow-hidden">
                  {/* Accordion header — always visible */}
                  <button
                    onClick={() => togglePage(pg.url)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/50 transition-colors text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{pg.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="text-foreground font-medium">{pg.primaryKeyword}</span>
                        <span> — {pg.keywordCount} keywords</span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground flex-shrink-0">
                      <span><strong className="text-foreground">{pg.totalImpressions.toLocaleString()}</strong> impr</span>
                      <span><strong className="text-brand">{pg.totalClicks.toLocaleString()}</strong> clicks</span>
                      <span>Best: <strong className={pg.bestPosition <= 3 ? 'text-green-400' : pg.bestPosition <= 10 ? 'text-amber-400' : 'text-foreground'}>{pg.bestPosition === 999 ? '—' : pg.bestPosition}</strong></span>
                    </div>
                  </button>

                  {/* Accordion content — keywords table */}
                  {isOpen && (
                    <div className="border-t border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-surface-2/50 text-muted-foreground">
                            <th className="px-4 py-1.5 text-left font-medium w-5"></th>
                            <th className="py-1.5 text-left font-medium">Keyword</th>
                            <th className="px-2 py-1.5 text-right font-medium">Impressions</th>
                            <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
                            <th className="px-2 py-1.5 text-right font-medium">Pos</th>
                            <th className="px-2 py-1.5 text-right font-medium">Volume</th>
                            <th className="px-2 py-1.5 text-right font-medium">KD</th>
                            <th className="px-2 py-1.5 text-right font-medium">CTR</th>
                            <th className="px-2 py-1.5 text-center font-medium">Intent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pg.keywords.map((kw, i) => {
                            const cannibalInfo = getCannibalizationInfo(kw.query)
                            return (
                              <tr key={kw.id} className={`border-t border-border/50 hover:bg-surface-2/30 ${cannibalInfo ? 'bg-red-500/5' : ''}`}>
                                <td className="px-4 py-1.5 text-center">
                                  {cannibalInfo ? <span title={cannibalInfo.recommendation}><AlertTriangle className="h-3 w-3 text-red-400" /></span>
                                    : i === 0 ? <Star className="h-3 w-3 text-brand" /> : null}
                                </td>
                                <td className="py-1.5 font-medium">{kw.query}</td>
                                <td className="px-2 py-1.5 text-right font-medium">{kw.impressions.toLocaleString()}</td>
                                <td className="px-2 py-1.5 text-right">{kw.clicks > 0 ? kw.clicks.toLocaleString() : '—'}</td>
                                <td className="px-2 py-1.5 text-right"><span className={kw.position <= 3 ? 'text-green-400 font-medium' : kw.position <= 10 ? 'text-amber-400' : ''}>{Math.round(kw.position)}</span></td>
                                <td className="px-2 py-1.5 text-right">{kw.searchVolume?.toLocaleString() ?? <span className="text-muted-foreground/40" title="DataForSEO did not return volume for this keyword">—</span>}</td>
                                <td className="px-2 py-1.5 text-right">{kw.kd != null ? <span className={kw.kd <= 30 ? 'text-green-400' : kw.kd <= 60 ? 'text-amber-400' : 'text-red-400'}>{kw.kd}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                                <td className="px-2 py-1.5 text-right">{kw.ctr > 0 ? `${(kw.ctr * 100).toFixed(1)}%` : '—'}</td>
                                <td className="px-2 py-1.5 text-center">{kw.intent && <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${INTENT_COLORS[kw.intent as SearchIntent] ?? ''}`}>{kw.intent}</span>}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── KEYWORDS VIEW ── */}
      {viewMode === 'keywords' && (
        <>
          <p className="mb-2 text-[10px] text-muted-foreground">
            {filtered.length} keywords
            {posFilter !== 'all' && <span className="text-brand ml-1">({posFilter})</span>}
            {posFilter === 'quickwins' && <span className="ml-1">— pos 4-20, impressions &gt;10, KD &lt;50 — keywords closest to page 1</span>}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-xs">
                  <th className="px-2 py-2 w-6"></th>
                  <SortHeader label="Keyword" field="query" className="text-left" />
                  <th className="px-3 py-2 text-left font-medium">URL</th>
                  <SortHeader label="Impressions" field="impressions" className="text-right" />
                  <SortHeader label="Clicks" field="clicks" className="text-right" />
                  <SortHeader label="Pos" field="position" className="text-right" />
                  <SortHeader label="Volume" field="searchVolume" className="text-right" />
                  <SortHeader label="KD" field="kd" className="text-right" />
                  <SortHeader label="CTR" field="ctr" className="text-right" />
                  <SortHeader label="CPC" field="cpc" className="text-right" />
                  <th className="px-2 py-2 text-center font-medium">Intent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw, idx) => {
                  const cannibalInfo = getCannibalizationInfo(kw.query)
                  return (
                    <tr key={kw.id} className={`border-b border-border hover:bg-surface-2/50 ${cannibalInfo ? 'bg-red-500/5' : ''}`}>
                      <td className="px-2 py-1.5 text-center">
                        {cannibalInfo ? <span title={`Cannibalization: ${cannibalInfo.recommendation}`}><AlertTriangle className="h-3.5 w-3.5 text-red-400" /></span>
                          : <span className="text-[10px] text-muted-foreground">{idx + 1}</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-sm">{kw.query}</div>
                        {cannibalInfo && <div className="text-[10px] text-red-400 mt-0.5">{cannibalInfo.recommendation}</div>}
                      </td>
                      <td className="px-3 py-1.5 max-w-[180px]">
                        {kw.pageUrl ? <div className="text-[11px] text-muted-foreground truncate" title={kw.pageUrl}>{kw.pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}</div> : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">{kw.impressions.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">{kw.clicks > 0 ? kw.clicks.toLocaleString() : '—'}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={`font-medium ${kw.position <= 3 ? 'text-green-400' : kw.position <= 10 ? 'text-amber-400' : kw.position <= 20 ? 'text-blue-400' : ''}`}>
                          {Math.round(kw.position)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{kw.searchVolume?.toLocaleString() ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right">
                        {kw.kd != null ? <span className={kw.kd <= 30 ? 'text-green-400' : kw.kd <= 60 ? 'text-amber-400' : 'text-red-400'}>{kw.kd}</span> : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs">{kw.ctr > 0 ? `${(kw.ctr * 100).toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-xs">{kw.cpc != null ? `$${kw.cpc.toFixed(2)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center">
                        {kw.intent ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${INTENT_COLORS[kw.intent as SearchIntent] ?? ''}`}>{kw.intent}</span> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
