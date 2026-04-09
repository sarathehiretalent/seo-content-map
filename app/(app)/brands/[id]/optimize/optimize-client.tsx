'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, Search, FileText, ChevronDown, ChevronRight, Stethoscope, AlertTriangle, CheckCircle2, Copy } from 'lucide-react'
import { AnalysisProgress } from '@/components/analysis/analysis-progress'

interface QuickWin {
  url: string
  keyword: string
  impressions: number
  clicks: number
  position: number
  ctr: number
  type: string
  icpAlignment?: string
}

interface PageFix {
  url: string
  type: string
  issue: string
  current: string
  suggested: string
  reason: string
  priority: string
}

interface AuditItem {
  url: string; title: string; titleLength: number; metaDescription: string; metaDescriptionLength: number
  h1: string; h1Count: number; h2s: string[]; wordCount: number; schemas: string[]; hasSchema: boolean
  internalLinks: number; imagesWithoutAlt: number; hasCanonical: boolean; icpAlignment?: string
}

interface Audit {
  id: string; status: string; auditData: string | null; quickWins: string | null
  recommendations: string | null; summary: string | null; createdAt: string | Date
}

type Tab = 'quickwins' | 'audit' | 'recommendations' | 'cannibalization' | 'errors'

const icpBadge = (alignment: string | undefined) => {
  if (!alignment || alignment === 'unknown') return null
  const colors: Record<string, string> = { aligned: 'bg-green-500/20 text-green-300', misaligned: 'bg-amber-500/20 text-amber-300', irrelevant: 'bg-red-500/20 text-red-300' }
  return <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${colors[alignment] ?? ''}`}>{alignment}</span>
}

const typeLabels: Record<string, { label: string; color: string }> = {
  title: { label: 'Title', color: 'bg-blue-500/20 text-blue-300' },
  meta_description: { label: 'Meta Desc', color: 'bg-purple-500/20 text-purple-300' },
  h1: { label: 'H1', color: 'bg-amber-500/20 text-amber-300' },
  schema: { label: 'Schema', color: 'bg-cyan-500/20 text-cyan-300' },
  internal_links: { label: 'Links', color: 'bg-green-500/20 text-green-300' },
  content: { label: 'Content', color: 'bg-pink-500/20 text-pink-300' },
  images: { label: 'Images', color: 'bg-orange-500/20 text-orange-300' },
  canonical: { label: 'Canonical', color: 'bg-slate-500/20 text-slate-300' },
  cannibalization: { label: 'Cannibalization', color: 'bg-red-500/20 text-red-300' },
}

export function OptimizeClient({ brand, hasDiagnostic, latestAudit, quickWins: serverQuickWins }: {
  brand: { id: string; domain: string }
  hasDiagnostic: boolean
  latestAudit: Audit | null
  quickWins: QuickWin[]
}) {
  const router = useRouter()
  const [runningId, setRunningId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('quickwins')
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [fixFilter, setFixFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [fixedPages, setFixedPages] = useState<Set<string>>(new Set())

  // Load fixed pages from DB on mount
  useEffect(() => {
    fetch(`/api/page-audit/fix-status?brandId=${brand.id}`).then(r => r.json()).then(d => {
      if (d.fixedPages) setFixedPages(new Set(d.fixedPages))
    }).catch(() => {})
  }, [brand.id])

  async function togglePageFixed(url: string) {
    setFixedPages((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url); else next.add(url)
      return next
    })
    await fetch('/api/page-audit/fix-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: brand.id, url }),
    })
  }

  // Use audit data if available, otherwise server-calculated quick wins
  const auditQuickWins: QuickWin[] = latestAudit?.quickWins ? JSON.parse(latestAudit.quickWins) : []
  const quickWins = auditQuickWins.length > 0 ? auditQuickWins : serverQuickWins
  const auditData: AuditItem[] = latestAudit?.auditData ? JSON.parse(latestAudit.auditData) : []
  const allFixesRaw: PageFix[] = latestAudit?.recommendations ? JSON.parse(latestAudit.recommendations) : []
  const cannibalizationFixes = allFixesRaw.filter((f) => f.type === 'cannibalization')
  const allFixes = allFixesRaw.filter((f) => f.type !== 'cannibalization')
  const summary = latestAudit?.summary ?? null
  const errorPages = auditData.filter((p: any) => p.statusCode && p.statusCode >= 400)
  const redirectPages = auditData.filter((p: any) => p.statusCode && (p.statusCode === 301 || p.statusCode === 302))
  const hasAudit = latestAudit?.status === 'completed' && auditData.length > 0

  const togglePage = (url: string) => {
    const next = new Set(expandedPages)
    if (next.has(url)) next.delete(url); else next.add(url)
    setExpandedPages(next)
  }

  if (!hasDiagnostic) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Diagnostic Required</h3>
          <p className="mt-2 text-sm text-muted-foreground">Run a diagnostic first.</p>
          <Link href={`/brands/${brand.id}/diagnostic`} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground">Go to Diagnostic</Link>
        </div>
      </div>
    )
  }

  async function handleRun(mode: 'traffic' | 'sitemap' = 'traffic') {
    setLoading(true)
    const res = await fetch('/api/page-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId: brand.id, mode }) })
    const data = await res.json()
    if (data.error) { alert(data.error); setLoading(false); return }
    setRunningId(data.auditId)
    setLoading(false)
  }

  // Group fixes by page for recommendations view
  const fixesByPage: Record<string, PageFix[]> = {}
  const filteredFixes = fixFilter === 'all' ? allFixes : allFixes.filter((f) => f.type === fixFilter)
  filteredFixes.forEach((f) => {
    if (!fixesByPage[f.url]) fixesByPage[f.url] = []
    fixesByPage[f.url].push(f)
  })
  const fixPages = Object.entries(fixesByPage)
    .filter(([url]) => !searchQuery || url.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort(([, a], [, b]) => b.filter((f) => f.priority === 'high').length - a.filter((f) => f.priority === 'high').length)

  // Fix type counts
  const fixTypeCounts: Record<string, number> = {}
  allFixes.forEach((f) => { fixTypeCounts[f.type] = (fixTypeCounts[f.type] || 0) + 1 })

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Optimize</h2>
          <p className="text-sm text-muted-foreground">Page-level SEO audit with specialized AI agents</p>
          {hasAudit && <p className="text-[10px] text-muted-foreground mt-0.5">Last audit: {new Date(latestAudit!.createdAt).toLocaleDateString()} &middot; 5 agents analyzed all pages in parallel</p>}
        </div>
        <div className="flex items-center gap-2">
          {hasAudit && (
            <button onClick={() => handleRun('sitemap')} disabled={loading || !!runningId}
              className="flex items-center gap-2 rounded-lg border border-brand/30 px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50">
              <FileText className="h-4 w-4" />Audit Next 25 Pages
            </button>
          )}
          <button onClick={() => handleRun('traffic')} disabled={loading || !!runningId}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
            <Search className="h-4 w-4" />{loading ? 'Starting...' : hasAudit ? 'Re-run Audit' : 'Audit Pages with Traffic'}
          </button>
        </div>
      </div>

      {runningId && <div className="mb-6"><AnalysisProgress pipelineId={runningId} type="page-audit" onComplete={() => { setRunningId(null); router.refresh() }} /></div>}
      {summary && <div className="mb-5 rounded-lg border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{summary}</p></div>}

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold text-brand">{quickWins.length}</div>
          <div className="text-xs text-muted-foreground">Quick Wins</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold">{auditData.length}</div>
          <div className="text-xs text-muted-foreground">Pages Audited</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold text-red-400">{allFixes.length}</div>
          <div className="text-xs text-muted-foreground">Total Fixes</div>
        </div>
        <div className="rounded-lg bg-card p-3 text-center">
          <div className="text-xl font-bold text-red-400">{allFixes.filter((f) => f.priority === 'high').length}</div>
          <div className="text-xs text-muted-foreground">High Priority</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-border overflow-hidden w-fit text-xs">
        <button onClick={() => setTab('quickwins')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'quickwins' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
          <Zap className="h-3 w-3" />Quick Wins
        </button>
        <button onClick={() => setTab('audit')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'audit' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
          <FileText className="h-3 w-3" />Page Audit
        </button>
        <button onClick={() => setTab('recommendations')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'recommendations' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
          <CheckCircle2 className="h-3 w-3" />Fixes ({allFixes.length})
        </button>
        {cannibalizationFixes.length > 0 && (
          <button onClick={() => setTab('cannibalization')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'cannibalization' ? 'bg-red-500 text-white' : 'hover:bg-surface-2'}`}>
            <Copy className="h-3 w-3" />Cannibalization ({cannibalizationFixes.length})
          </button>
        )}
        {errorPages.length > 0 && (
          <button onClick={() => setTab('errors')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'errors' ? 'bg-red-500 text-white' : 'hover:bg-surface-2'}`}>
            <AlertTriangle className="h-3 w-3" />Errors ({errorPages.length})
          </button>
        )}
      </div>

      {/* Search bar — shared across tabs */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search pages by URL or keyword..."
          className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>

      {/* ═══ Quick Wins ═══ */}
      {tab === 'quickwins' && (() => {
        const q = searchQuery.toLowerCase()
        const filtered = q
          ? quickWins.filter((qw) => qw.url.toLowerCase().includes(q) || qw.keyword.toLowerCase().includes(q) || qw.url.replace(`https://${brand.domain}`, '').toLowerCase().includes(q))
          : quickWins
        // Find fixes for this exact page URL
        const getPageFixes = (url: string) => {
          const path = url.replace(`https://${brand.domain}`, '').replace(/\/$/, '')
          return allFixes.filter((f) => {
            const fixPath = f.url.replace(/\/$/, '')
            return fixPath === path || fixPath === url.replace(/\/$/, '')
          })
        }

        return (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">Highest impact opportunities — {filtered.length} pages</p>
            {filtered.length > 0 ? (
              <div className="space-y-2">
                {filtered.map((qw, i) => {
                  const pageFixes = getPageFixes(qw.url)
                  const isOpen = expandedPages.has(qw.url)
                  return (
                    <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                      <button onClick={() => togglePage(qw.url)} className="w-full p-3 text-left hover:bg-surface-2/30">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <div className="text-sm font-medium">{qw.url.replace(`https://${brand.domain}`, '') || '/'}</div>
                            {icpBadge(qw.icpAlignment)}
                          </div>
                          <div className="flex items-center gap-3 text-xs flex-shrink-0">
                            <span>Pos <strong>{qw.position}</strong></span>
                            <span><strong>{qw.impressions.toLocaleString()}</strong> impr</span>
                            <span>CTR <strong className={qw.ctr < 0.02 ? 'text-red-400' : ''}>{(qw.ctr * 100).toFixed(1)}%</strong></span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${qw.type === 'low_ctr' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                              {qw.type === 'low_ctr' ? 'Low CTR' : 'Position Opp.'}
                            </span>
                            {pageFixes.length > 0 && <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] text-brand">{pageFixes.length} fixes</span>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 ml-5">Primary: <span className="text-foreground">{qw.keyword}</span></div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-border px-4 py-3">
                          <p className="text-xs text-muted-foreground mb-2">
                            {qw.type === 'low_ctr' ? 'High visibility but low clicks — improve meta title & description to increase CTR' : `Position ${qw.position} — improve content depth and on-page SEO to reach top 3`}
                          </p>
                          {pageFixes.length > 0 ? (
                            <div className="space-y-2">
                              <h4 className="text-xs font-medium text-brand">Fixes from AI agents:</h4>
                              {pageFixes.map((fix, j) => {
                                const info = typeLabels[fix.type] ?? { label: fix.type, color: 'bg-surface-2 text-foreground' }
                                return (
                                  <div key={j} className="text-xs rounded-lg bg-surface-2/50 p-2">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${info.color}`}>{info.label}</span>
                                      <span className="text-muted-foreground">{fix.issue}</span>
                                    </div>
                                    {fix.current && <div className="text-red-400/70 line-through">{fix.current.substring(0, 120)}</div>}
                                    {fix.suggested && <div className="text-green-400 font-medium">{fix.suggested}</div>}
                                  </div>
                                )
                              })}
                            </div>
                          ) : hasAudit ? (
                            <p className="text-xs text-muted-foreground">No specific fixes found for this page. It may need manual review.</p>
                          ) : (
                            <p className="text-xs text-amber-400">Run Page Audit to get specific fixes for this page</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground p-4">No quick wins match your search.</p>}
          </div>
        )
      })()}

      {/* ═══ Page Audit ═══ */}
      {tab === 'audit' && (
        <div>
          {!hasAudit ? (
            <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click &quot;Run Page Audit&quot; to scrape and analyze all pages</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="mb-3 text-xs text-muted-foreground">On-page SEO data for {auditData.length} pages</p>
              {auditData.filter((page) => {
                if (!searchQuery) return true
                const q = searchQuery.toLowerCase()
                return page.url.toLowerCase().includes(q) || page.url.replace(`https://${brand.domain}`, '').toLowerCase().includes(q)
              }).map((page) => {
                const path = page.url.replace(`https://${brand.domain}`, '') || '/'
                const isOpen = expandedPages.has(page.url)
                const issues: string[] = []
                if (page.titleLength === 0) issues.push('No title')
                else if (page.titleLength > 60) issues.push('Title >60c')
                if (page.metaDescriptionLength === 0) issues.push('No meta desc')
                else if (page.metaDescriptionLength > 160) issues.push('Meta >160c')
                if (page.h1Count !== 1) issues.push(page.h1Count === 0 ? 'No H1' : 'Multiple H1s')
                if (!page.hasSchema) issues.push('No schema')
                if (page.imagesWithoutAlt > 0) issues.push(`${page.imagesWithoutAlt} img no alt`)
                if (page.wordCount < 300) issues.push('Thin content')
                if (page.internalLinks < 3) issues.push('Few links')

                return (
                  <div key={page.url} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center">
                      <button onClick={(e) => { e.stopPropagation(); togglePageFixed(page.url) }}
                        className={`flex-shrink-0 w-8 flex items-center justify-center py-2.5 ${fixedPages.has(page.url) ? 'text-green-400' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
                        title={fixedPages.has(page.url) ? 'Fixes applied — click to unmark' : 'Mark as fixes applied'}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => togglePage(page.url)} className={`flex-1 flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2/50 text-left ${fixedPages.has(page.url) ? 'opacity-50' : ''}`}>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{path}</span>
                          {icpBadge(page.icpAlignment)}
                          {fixedPages.has(page.url) && <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] text-green-300">Fixed</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {issues.length > 0 ? (
                            <span className="flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                              <AlertTriangle className="h-3 w-3" />{issues.length}
                            </span>
                          ) : <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-300">OK</span>}
                          <span className="text-[10px] text-muted-foreground">{page.wordCount}w</span>
                        </div>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div><span className="text-muted-foreground">Title ({page.titleLength}c):</span> <span className={page.titleLength === 0 ? 'text-red-400' : page.titleLength > 60 ? 'text-amber-400' : 'text-green-400'}>{page.title || 'MISSING'}</span></div>
                            <div><span className="text-muted-foreground">Meta ({page.metaDescriptionLength}c):</span> <span className={page.metaDescriptionLength === 0 ? 'text-red-400' : page.metaDescriptionLength > 160 ? 'text-amber-400' : ''}>{page.metaDescription.substring(0, 80) || 'MISSING'}{page.metaDescription.length > 80 ? '...' : ''}</span></div>
                            <div><span className="text-muted-foreground">H1 ({page.h1Count}):</span> {page.h1 || <span className="text-red-400">MISSING</span>}</div>
                            <div><span className="text-muted-foreground">H2s:</span> {page.h2s.length} | <span className="text-muted-foreground">Words:</span> <span className={page.wordCount < 300 ? 'text-red-400' : ''}>{page.wordCount}</span></div>
                          </div>
                          <div className="space-y-1">
                            <div><span className="text-muted-foreground">Schema:</span> {page.hasSchema ? <span className="text-green-400">{page.schemas.join(', ')}</span> : <span className="text-amber-400">None</span>}</div>
                            <div><span className="text-muted-foreground">Internal links:</span> <span className={page.internalLinks < 3 ? 'text-amber-400' : ''}>{page.internalLinks}</span></div>
                            <div><span className="text-muted-foreground">Images w/o alt:</span> <span className={page.imagesWithoutAlt > 0 ? 'text-red-400' : 'text-green-400'}>{page.imagesWithoutAlt}</span></div>
                            <div><span className="text-muted-foreground">Canonical:</span> {page.hasCanonical ? <span className="text-green-400">Yes</span> : <span className="text-amber-400">No</span>}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Recommendations (Fixes) ═══ */}
      {tab === 'recommendations' && (
        <div>
          {allFixes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm text-muted-foreground">Run page audit to get fixes from 5 specialized AI agents</p>
            </div>
          ) : (
            <>
              {/* Filter by fix type */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button onClick={() => setFixFilter('all')} className={`rounded px-2 py-1 text-xs font-medium ${fixFilter === 'all' ? 'bg-brand text-primary-foreground' : 'bg-surface-2 hover:bg-muted'}`}>All ({allFixes.length})</button>
                {Object.entries(fixTypeCounts).map(([type, count]) => {
                  const info = typeLabels[type] ?? { label: type, color: 'bg-surface-2' }
                  return (
                    <button key={type} onClick={() => setFixFilter(type)} className={`rounded px-2 py-1 text-xs font-medium ${fixFilter === type ? 'bg-brand text-primary-foreground' : info.color}`}>
                      {info.label} ({count})
                    </button>
                  )
                })}
              </div>

              <div className="space-y-2">
                {fixPages.map(([url, fixes]) => (
                  <div key={url} className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2 bg-surface-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{url}</span>
                      <div className="flex gap-1">
                        {fixes.filter((f) => f.priority === 'high').length > 0 && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">{fixes.filter((f) => f.priority === 'high').length} high</span>}
                        <span className="text-[10px] text-muted-foreground">{fixes.length} fixes</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border/50">
                      {fixes.map((fix, j) => {
                        const info = typeLabels[fix.type] ?? { label: fix.type, color: 'bg-surface-2 text-foreground' }
                        return (
                          <div key={j} className="px-4 py-2.5 text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${info.color}`}>{info.label}</span>
                              <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${fix.priority === 'high' ? 'bg-red-500/20 text-red-300' : fix.priority === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-muted-foreground'}`}>{fix.priority}</span>
                              <span className="text-muted-foreground">{fix.issue}</span>
                            </div>
                            {fix.current && <div className="text-red-400/70 line-through mt-0.5">{fix.current.substring(0, 150)}</div>}
                            {fix.suggested && <div className="text-green-400 font-medium mt-0.5">{fix.suggested}</div>}
                            <div className="text-muted-foreground mt-0.5">{fix.reason}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Cannibalization ═══ */}
      {/* ═══ Errors (404, 500, etc.) ═══ */}
      {tab === 'errors' && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            Pages returning error status codes. 404 pages lose link equity and hurt user experience. Create 301 redirects to relevant pages or restore the content.
          </p>
          <div className="space-y-1">
            {errorPages.map((page: any, i: number) => {
              const path = page.url.replace(`https://${brand.domain}`, '') || page.url
              const isFixed = fixedPages.has(page.url)
              return (
                <div key={i} className={`flex items-center rounded-lg border border-red-500/20 bg-card overflow-hidden ${isFixed ? 'opacity-50' : ''}`}>
                  <button onClick={() => togglePageFixed(page.url)}
                    className={`flex-shrink-0 w-8 flex items-center justify-center py-3 ${isFixed ? 'text-green-400' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}>
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <div className="flex-1 flex items-center justify-between px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium">{path}</div>
                      {isFixed && <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] text-green-300">Redirect created</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-300">{page.statusCode}</span>
                      <span className="text-[10px] text-muted-foreground">Create 301 redirect to relevant page</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {errorPages.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">No error pages detected</div>}
        </div>
      )}

      {/* ═══ Cannibalization ═══ */}
      {tab === 'cannibalization' && (() => {
        // Group cannibalization fixes by keyword (from the issue field)
        const byKeyword = new Map<string, PageFix[]>()
        for (const fix of cannibalizationFixes) {
          // Extract keyword from issue: "Competing with [url] for keyword: [keyword]"
          const kwMatch = fix.issue.match(/keyword:\s*(.+)$/i)
          const keyword = kwMatch ? kwMatch[1].trim() : fix.issue
          if (!byKeyword.has(keyword)) byKeyword.set(keyword, [])
          byKeyword.get(keyword)!.push(fix)
        }
        const groups = [...byKeyword.entries()].sort((a, b) => b[1].length - a[1].length)

        return (
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Keyword cannibalization happens when multiple pages on your site compete for the same keyword, confusing Google about which page to rank.
              For each keyword, we identify which page should be the primary one and what to do with the competing pages.
            </p>
            {groups.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">No cannibalization issues detected</div>}
            <div className="space-y-2">
              {groups.map(([keyword, fixes]) => {
                const isOpen = expandedPages.has(`cannibal:${keyword}`)
                return (
                  <div key={keyword} className="rounded-lg border border-red-500/20 bg-card overflow-hidden">
                    <button onClick={() => togglePage(`cannibal:${keyword}`)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2/30 text-left">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{keyword}</div>
                        <div className="text-[10px] text-red-400">{fixes.length + 1} pages competing for this keyword</div>
                      </div>
                      <span className="rounded px-2 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-300">{fixes.length} to resolve</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-red-500/10 px-4 py-3 space-y-2">
                        {fixes.map((fix, fi) => (
                          <div key={fi} className="rounded-lg bg-surface-2/30 p-3 text-xs space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-red-400 font-medium truncate">{fix.url.replace(/^https?:\/\/[^/]+/, '')}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${fix.priority === 'high' ? 'bg-red-500/20 text-red-300' : fix.priority === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-muted-foreground'}`}>{fix.priority}</span>
                            </div>
                            <div className="text-muted-foreground">{fix.current}</div>
                            <div className="text-green-400 font-medium">{fix.suggested}</div>
                            <div className="text-muted-foreground italic">{fix.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
