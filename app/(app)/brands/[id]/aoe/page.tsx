'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Bot, ChevronDown, ChevronRight, ExternalLink, Search, CheckCircle2, Circle, Loader2, ListChecks, LayoutList } from 'lucide-react'

interface AeoAction { type: string; action: string; impact: string; done: boolean }

interface AeoPage {
  path: string; primaryKeyword: string; impressions: number
  hasSchema: boolean; hasFaqSchema: boolean; h2Count: number; h2sAsQuestions: number
  wordCount: number; internalLinks: number; hasPaa: boolean; hasAiOverview: boolean
  hasFeaturedSnippet: boolean; ownsFeaturedSnippet: boolean; paaQuestions: string[]
  readinessScore: number; readinessLevel: string
  actions: AeoAction[]
}

const scoreColors: Record<string, string> = {
  ready: 'text-green-400 bg-green-500/20',
  needs_work: 'text-amber-400 bg-amber-500/20',
  not_optimized: 'text-red-400 bg-red-500/20',
}
const scoreLabels: Record<string, string> = {
  ready: 'AI Ready', needs_work: 'Needs Work', not_optimized: 'Not Optimized',
}
const impactColors: Record<string, string> = {
  high: 'bg-red-500/20 text-red-300', medium: 'bg-amber-500/20 text-amber-300', low: 'bg-surface-2 text-muted-foreground',
}

export default function AeoPage() {
  const params = useParams()
  const brandId = params.id as string

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [data, setData] = useState<{ pages: AeoPage[]; summary: string } | null>(null)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterLevel, setFilterLevel] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'pages' | 'actions'>('pages')
  const [filterImpact, setFilterImpact] = useState<string>('all')

  // Load persisted data on mount
  useEffect(() => {
    fetch(`/api/aeo?brandId=${brandId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.pages) setData(d) })
      .catch(() => {})
      .finally(() => setInitialLoading(false))
  }, [brandId])

  async function handleRun() {
    setLoading(true)
    try {
      const res = await fetch('/api/aeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      })
      const result = await res.json()
      if (result.error) alert(result.error)
      else setData(result)
    } catch { alert('Failed') }
    setLoading(false)
  }

  const toggleAction = useCallback(async (pagePath: string, actionIndex: number, done: boolean) => {
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev
      const pages = prev.pages.map((p) => {
        if (p.path !== pagePath) return p
        const actions = p.actions.map((a, i) => i === actionIndex ? { ...a, done } : a)
        return { ...p, actions }
      })
      return { ...prev, pages }
    })
    // Persist
    fetch('/api/aeo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, pagePath, actionIndex, done }),
    }).catch(() => {})
  }, [brandId])

  const togglePage = (path: string) => {
    const next = new Set(expandedPages)
    if (next.has(path)) next.delete(path); else next.add(path)
    setExpandedPages(next)
  }

  const pages = data?.pages ?? []
  const filtered = pages
    .filter((p) => filterLevel === 'all' || p.readinessLevel === filterLevel)
    .filter((p) => !searchQuery || p.path.toLowerCase().includes(searchQuery.toLowerCase()) || p.primaryKeyword.toLowerCase().includes(searchQuery.toLowerCase()))

  const ready = pages.filter((p) => p.readinessLevel === 'ready').length
  const needsWork = pages.filter((p) => p.readinessLevel === 'needs_work').length
  const notOpt = pages.filter((p) => p.readinessLevel === 'not_optimized').length
  const allActions = pages.flatMap((p) => p.actions.map((a, i) => ({ ...a, pagePath: p.path, pageKeyword: p.primaryKeyword, pageScore: p.readinessScore, pageLevel: p.readinessLevel, actionIndex: i })))
  const totalActions = allActions.length
  const doneActions = allActions.filter((a) => a.done).length
  const highImpact = allActions.filter((a) => a.impact === 'high').length

  // Priority Actions: flat list, sorted by impact (high > medium > low), undone first
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const priorityActions = allActions
    .filter((a) => filterImpact === 'all' || a.impact === filterImpact)
    .filter((a) => !searchQuery || a.pagePath.toLowerCase().includes(searchQuery.toLowerCase()) || a.pageKeyword.toLowerCase().includes(searchQuery.toLowerCase()) || a.action.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      return (impactOrder[a.impact] ?? 2) - (impactOrder[b.impact] ?? 2)
    })

  if (initialLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AEO — Answer Engine Optimization</h2>
          <p className="text-sm text-muted-foreground">Optimize pages to be cited by AI (ChatGPT, Perplexity, Google AI Overview)</p>
        </div>
        <button onClick={handleRun} disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {loading ? 'Analyzing...' : data ? 'Re-analyze' : 'Run AEO Analysis'}
        </button>
      </div>

      {!data && !loading && (
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col items-center text-center mb-6">
            <Bot className="mb-3 h-10 w-10 text-brand" />
            <h3 className="text-lg font-semibold">AI Citability Analysis</h3>
            <p className="mt-1 text-sm text-muted-foreground">Analyze how likely AI engines are to cite your pages</p>
          </div>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
              <div><span className="text-foreground font-medium">AI Readiness Score</span> per page — FAQ schema, question H2s, answer-first format, data density</div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
              <div><span className="text-foreground font-medium">Specific actions</span> per page — what to change to increase AI citation probability</div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
              <div><span className="text-foreground font-medium">Verify manually</span> — check if ChatGPT/Perplexity cite you after applying changes</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground text-center">Requires: Page Audit (Optimize) completed</p>
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="mb-5 rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{data.summary}</p>
          </div>

          {/* Stats */}
          <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">
            <button onClick={() => setFilterLevel('all')} className={`rounded-lg bg-card p-3 text-center border transition-all ${filterLevel === 'all' ? 'border-brand ring-1 ring-brand' : 'border-transparent'}`}>
              <div className="text-xl font-bold">{pages.length}</div><div className="text-xs text-muted-foreground">Analyzed</div>
            </button>
            <button onClick={() => setFilterLevel(filterLevel === 'ready' ? 'all' : 'ready')} className={`rounded-lg bg-card p-3 text-center border transition-all ${filterLevel === 'ready' ? 'border-green-500 ring-1 ring-green-500' : 'border-transparent'}`}>
              <div className="text-xl font-bold text-green-400">{ready}</div><div className="text-xs text-muted-foreground">AI Ready</div>
            </button>
            <button onClick={() => setFilterLevel(filterLevel === 'needs_work' ? 'all' : 'needs_work')} className={`rounded-lg bg-card p-3 text-center border transition-all ${filterLevel === 'needs_work' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-transparent'}`}>
              <div className="text-xl font-bold text-amber-400">{needsWork}</div><div className="text-xs text-muted-foreground">Needs Work</div>
            </button>
            <button onClick={() => setFilterLevel(filterLevel === 'not_optimized' ? 'all' : 'not_optimized')} className={`rounded-lg bg-card p-3 text-center border transition-all ${filterLevel === 'not_optimized' ? 'border-red-500 ring-1 ring-red-500' : 'border-transparent'}`}>
              <div className="text-xl font-bold text-red-400">{notOpt}</div><div className="text-xs text-muted-foreground">Not Optimized</div>
            </button>
            <div className="rounded-lg bg-card p-3 text-center border border-transparent">
              <div className="text-xl font-bold">{doneActions}<span className="text-sm text-muted-foreground font-normal">/{totalActions}</span></div><div className="text-xs text-muted-foreground">Done</div>
            </div>
            <div className="rounded-lg bg-card p-3 text-center border border-transparent">
              <div className="text-xl font-bold text-red-400">{highImpact}</div><div className="text-xs text-muted-foreground">High Impact</div>
            </div>
          </div>

          {/* Tabs + Search */}
          <div className="mb-3 flex items-center gap-3">
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              <button onClick={() => setActiveTab('pages')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${activeTab === 'pages' ? 'bg-brand text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                <LayoutList className="h-3.5 w-3.5" />By Page
              </button>
              <button onClick={() => setActiveTab('actions')}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors ${activeTab === 'actions' ? 'bg-brand text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                <ListChecks className="h-3.5 w-3.5" />Priority Actions
              </button>
            </div>
            {activeTab === 'actions' && (
              <div className="flex gap-1 text-[10px]">
                {['all', 'high', 'medium', 'low'].map((imp) => (
                  <button key={imp} onClick={() => setFilterImpact(imp)}
                    className={`rounded px-2 py-1 font-medium transition-colors ${filterImpact === imp ? (imp === 'high' ? 'bg-red-500/30 text-red-300' : imp === 'medium' ? 'bg-amber-500/30 text-amber-300' : imp === 'low' ? 'bg-surface-2 text-foreground' : 'bg-brand/20 text-brand') : 'text-muted-foreground hover:text-foreground'}`}>
                    {imp === 'all' ? 'All' : imp.charAt(0).toUpperCase() + imp.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search pages, keywords, or actions..."
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>

          {/* Tab: By Page */}
          {activeTab === 'pages' && (
            <div className="space-y-1">
              {filtered.map((page) => {
                const isOpen = expandedPages.has(page.path)
                const pageDone = page.actions.filter((a) => a.done).length
                return (
                  <div key={page.path} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button onClick={() => togglePage(page.path)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/30 text-left">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{page.path}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {page.impressions > 0 ? <>{page.primaryKeyword} · {page.impressions.toLocaleString()} impr</> : <span className="text-amber-400/70">No GSC keyword data — score based on page structure only</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {page.actions.length > 0 && (
                          <span className={`text-[10px] ${pageDone === page.actions.length ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {pageDone}/{page.actions.length} done
                          </span>
                        )}
                        <span className="text-sm font-bold">{page.readinessScore}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${scoreColors[page.readinessLevel]}`}>{scoreLabels[page.readinessLevel]}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border px-4 py-3 text-xs space-y-3">
                        {/* Current state */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div>FAQ Schema: {page.hasFaqSchema ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>}</div>
                            <div>H2s as questions: {page.h2sAsQuestions} of {page.h2Count}</div>
                            <div>Word count: {page.wordCount}</div>
                            <div>Internal links: {page.internalLinks}</div>
                          </div>
                          <div className="space-y-1">
                            <div>PAA present: {page.hasPaa ? <span className="text-purple-400">Yes</span> : 'No'}</div>
                            <div>AI Overview: {page.hasAiOverview ? <span className="text-amber-400">Yes</span> : 'No'}</div>
                            <div>Featured Snippet: {page.ownsFeaturedSnippet ? <span className="text-green-400">We own it</span> : page.hasFeaturedSnippet ? <span className="text-red-400">Competitor owns</span> : 'None'}</div>
                          </div>
                        </div>

                        {/* PAA Questions */}
                        {page.paaQuestions.length > 0 && (
                          <div>
                            <h4 className="font-medium text-purple-400 mb-1">PAA Questions to answer:</h4>
                            <ul className="space-y-0.5 text-muted-foreground">
                              {page.paaQuestions.map((q, i) => <li key={i}>• {q}</li>)}
                            </ul>
                          </div>
                        )}

                        {/* Actions with checkboxes */}
                        {page.actions.length > 0 && (
                          <div>
                            <h4 className="font-medium text-brand mb-1">Actions:</h4>
                            <div className="space-y-1.5">
                              {page.actions.map((action, i) => (
                                <button key={i} onClick={() => toggleAction(page.path, i, !action.done)}
                                  className={`w-full flex items-start gap-2 rounded-lg p-2 text-left transition-colors ${action.done ? 'bg-green-500/5' : 'bg-surface-2/50 hover:bg-surface-2/80'}`}>
                                  {action.done
                                    ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                                    : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                                  <span className={`rounded px-1 py-0.5 text-[9px] font-medium flex-shrink-0 mt-0.5 ${impactColors[action.impact]}`}>{action.impact}</span>
                                  <span className={`${action.done ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}>{action.action}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Verify manually */}
                        {page.impressions > 0 && (
                          <div className="border-t border-border/50 pt-2">
                            <h4 className="font-medium text-muted-foreground mb-1">Verify AI citation:</h4>
                            <div className="flex gap-2">
                              <a href={`https://www.perplexity.ai/search?q=${encodeURIComponent(page.primaryKeyword)}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-[10px] hover:bg-muted">
                                <ExternalLink className="h-3 w-3" />Perplexity
                              </a>
                              <a href={`https://chatgpt.com/?q=${encodeURIComponent(page.primaryKeyword)}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-[10px] hover:bg-muted">
                                <ExternalLink className="h-3 w-3" />ChatGPT
                              </a>
                              <a href={`https://www.google.com/search?q=${encodeURIComponent(page.primaryKeyword)}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-[10px] hover:bg-muted">
                                <ExternalLink className="h-3 w-3" />Google
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Tab: Priority Actions (flat list) */}
          {activeTab === 'actions' && (
            <div className="space-y-1">
              {priorityActions.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">No actions match your filters</div>
              )}
              {priorityActions.map((action, idx) => (
                <button key={`${action.pagePath}-${action.actionIndex}`} onClick={() => toggleAction(action.pagePath, action.actionIndex, !action.done)}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${action.done ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-card hover:bg-surface-2/30'}`}>
                  {action.done
                    ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                    : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs ${action.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{action.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {action.pagePath} · {action.pageKeyword} · Score: {action.pageScore}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${impactColors[action.impact]}`}>{action.impact}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${scoreColors[action.pageLevel]}`}>{scoreLabels[action.pageLevel]}</span>
                  </div>
                </button>
              ))}
              {priorityActions.length > 0 && (
                <div className="text-center pt-2 text-[10px] text-muted-foreground">
                  {priorityActions.filter((a) => a.done).length} of {priorityActions.length} actions completed
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
