'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Shield, Target, Users, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react'
import { AnalysisProgress } from '@/components/analysis/analysis-progress'

interface SerpPerformanceItem {
  keyword: string
  ourPosition: number | null
  ourUrl: string | null
  impressions: number
  clicks: number
  features: {
    featuredSnippet: boolean
    ownsFeaturedSnippet: boolean
    snippetOwner: string | null
    paa: boolean
    paaQuestions: string[]
    aiOverview: boolean
    video: boolean
    images: boolean
  }
  topCompetitors: Array<{ domain: string; position: number; title: string; isDirect?: boolean; isUs?: boolean; isGeneric?: boolean }>
}

interface CompetitorGapItem {
  keyword: string
  volume: number | null
  kd: number | null
  weAppear?: boolean
  ourPosition?: number | null
  competitors: Array<{ domain: string; position: number }>
}

interface IcpData {
  aligned: number
  misaligned: number
  irrelevant: number
  details: Array<{ keyword: string; alignment: string; reason: string }>
}

interface Opportunity {
  type: string
  keyword: string
  action: string
  impact: string
  priority: string
}

interface Analysis {
  id: string
  status: string
  serpPerformance: string | null
  competitorGap: string | null
  icpAlignment: string | null
  opportunities: string | null
  summary: string | null
  createdAt: string | Date
}

type Tab = 'performance' | 'gap' | 'icp' | 'opportunities'

export function SerpAnalysisClient({ brand, analysis }: { brand: { id: string; domain: string }; analysis: Analysis | null }) {
  const router = useRouter()
  const [runningId, setRunningId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('performance')
  const [expandedKw, setExpandedKw] = useState<Set<string>>(new Set())
  const [icpFilter, setIcpFilter] = useState<'all' | 'aligned' | 'misaligned' | 'irrelevant'>('all')
  const [gapCompFilter, setGapCompFilter] = useState<string>('all')

  const serpPerformance: SerpPerformanceItem[] = analysis?.serpPerformance ? JSON.parse(analysis.serpPerformance) : []
  const competitorGap: CompetitorGapItem[] = analysis?.competitorGap ? JSON.parse(analysis.competitorGap) : []
  const icpData: IcpData | null = analysis?.icpAlignment ? JSON.parse(analysis.icpAlignment) : null
  const opportunities: Opportunity[] = analysis?.opportunities ? JSON.parse(analysis.opportunities) : []
  const summary = analysis?.summary ?? null

  const hasData = analysis?.status === 'completed' && serpPerformance.length > 0

  async function handleRun() {
    setLoading(true)
    const res = await fetch('/api/serp-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: brand.id }),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); setLoading(false); return }
    setRunningId(data.analysisId)
    setLoading(false)
  }

  const toggleKw = (kw: string) => {
    const next = new Set(expandedKw)
    if (next.has(kw)) next.delete(kw); else next.add(kw)
    setExpandedKw(next)
  }

  const typeLabels: Record<string, { label: string; color: string }> = {
    snippet_gap: { label: 'Win Snippet', color: 'bg-blue-500/20 text-blue-300' },
    keyword_gap: { label: 'New Content', color: 'bg-purple-500/20 text-purple-300' },
    aiOverview_gap: { label: 'AI Visibility', color: 'bg-amber-500/20 text-amber-300' },
    paa_opportunity: { label: 'PAA', color: 'bg-cyan-500/20 text-cyan-300' },
    icp_misalignment: { label: 'ICP Issue', color: 'bg-red-500/20 text-red-300' },
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">SERP Analysis</h2>
          <p className="text-sm text-muted-foreground">SERP features, competitor gaps, and ICP alignment</p>
          {analysis?.createdAt && analysis.status === 'completed' && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Last run: {new Date(analysis.createdAt).toLocaleDateString()} &middot; Recommended: every 1-3 months
            </p>
          )}
        </div>
        <button onClick={handleRun} disabled={loading || !!runningId}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
          <Search className="h-4 w-4" />
          {loading ? 'Starting...' : hasData ? 'Re-run Analysis' : 'Run SERP Analysis'}
        </button>
      </div>

      {runningId && (
        <div className="mb-6">
          <AnalysisProgress pipelineId={runningId} type="serp-analysis" onComplete={() => { setRunningId(null); router.refresh() }} />
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mb-5 rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {!hasData && !runningId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">No SERP Analysis yet</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Run a SERP Analysis to see your SERP feature ownership, competitor keyword gaps, and ICP alignment. Requires a completed diagnostic first.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Stats bar */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-card p-3 text-center">
              <div className="text-xl font-bold">{serpPerformance.length}</div>
              <div className="text-xs text-muted-foreground">Keywords Analyzed</div>
            </div>
            <div className="rounded-lg bg-card p-3 text-center">
              <div className="text-xl font-bold text-purple-400">{competitorGap.length}</div>
              <div className="text-xs text-muted-foreground">Keyword Gaps</div>
            </div>
            <div className="rounded-lg bg-card p-3 text-center">
              <div className="text-xl font-bold text-green-400">{icpData?.aligned ?? 0}</div>
              <div className="text-xs text-muted-foreground">ICP Aligned</div>
              {icpData && <div className="text-[10px] text-muted-foreground">{icpData.misaligned + icpData.irrelevant} not aligned</div>}
            </div>
            <div className="rounded-lg bg-card p-3 text-center">
              <div className="text-xl font-bold text-brand">{opportunities.length}</div>
              <div className="text-xs text-muted-foreground">Opportunities</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-lg border border-border overflow-hidden w-fit text-xs">
            {([
              { key: 'performance' as Tab, label: 'Our SERP Performance', icon: Target },
              { key: 'gap' as Tab, label: 'Keyword Gap', icon: Shield },
              { key: 'icp' as Tab, label: 'ICP Alignment', icon: Users },
              { key: 'opportunities' as Tab, label: 'Opportunities', icon: ArrowUpDown },
            ]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === t.key ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}>
                <t.icon className="h-3 w-3" />{t.label}
              </button>
            ))}
          </div>

          {/* ═══ Tab 1: Our SERP Performance ═══ */}
          {tab === 'performance' && (
            <div className="space-y-1">
              <p className="mb-3 text-xs text-muted-foreground">Top 20 keywords by impressions — SERP features and who owns them</p>
              {serpPerformance.map((item) => {
                const isOpen = expandedKw.has(item.keyword)
                return (
                  <div key={item.keyword} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button onClick={() => toggleKw(item.keyword)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 text-left">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.keyword}</div>
                        <div className="text-[11px] text-muted-foreground">{item.ourUrl ?? ''}</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-shrink-0">
                        <span title="Average position from GSC (90 days)">Avg Pos <strong className={item.ourPosition && item.ourPosition <= 3 ? 'text-green-400' : item.ourPosition && item.ourPosition <= 10 ? 'text-amber-400' : ''}>{item.ourPosition ?? '—'}</strong></span>
                        <span>{item.impressions.toLocaleString()} impr</span>
                        {item.features.featuredSnippet && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${item.features.ownsFeaturedSnippet ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            {item.features.ownsFeaturedSnippet ? 'Our Snippet' : 'Competitor Snippet'}
                          </span>
                        )}
                        {item.features.paa && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">PAA</span>}
                        {item.features.aiOverview && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">AI</span>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium text-muted-foreground mb-1">SERP Features</h4>
                            <div className="space-y-1">
                              <div>Featured Snippet: {item.features.featuredSnippet ? (item.features.ownsFeaturedSnippet ? <span className="text-green-400">We own it</span> : <span className="text-red-400">Owned by {item.features.snippetOwner}</span>) : <span className="text-muted-foreground">None</span>}</div>
                              <div>People Also Ask: {item.features.paa ? <span className="text-purple-400">Yes</span> : 'No'}</div>
                              <div>AI Overview: {item.features.aiOverview ? <span className="text-amber-400">Yes</span> : 'No'}</div>
                              <div>Video: {item.features.video ? 'Yes' : 'No'} | Images: {item.features.images ? 'Yes' : 'No'}</div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-muted-foreground mb-1">SERP Rankings (Top 10)</h4>
                            {item.topCompetitors.map((c, i) => (
                              <div key={i} className={`flex items-center gap-1.5 ${c.isUs ? 'font-medium' : ''}`}>
                                <span className="text-muted-foreground w-6 text-right">#{c.position}</span>
                                <span className={c.isUs ? 'text-green-400' : c.isDirect ? 'text-red-400' : c.isGeneric ? 'text-muted-foreground/50' : 'text-muted-foreground'}>
                                  {c.domain}
                                </span>
                                {c.isUs && <span className="rounded bg-green-500/20 px-1 py-0.5 text-[9px] font-medium text-green-300">You</span>}
                                {c.isDirect && <span className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-medium text-red-300">Direct Competitor</span>}
                              </div>
                            ))}
                            {item.topCompetitors.length === 0 && <span className="text-muted-foreground">SERP data unavailable</span>}
                          </div>
                        </div>
                        {item.features.paaQuestions.length > 0 && (
                          <div>
                            <h4 className="font-medium text-muted-foreground mb-1">PAA Questions</h4>
                            <ul className="text-muted-foreground space-y-0.5">
                              {item.features.paaQuestions.map((q, i) => <li key={i}>• {q}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ Tab 2: Keyword Gap ═══ */}
          {tab === 'gap' && (() => {
            const allCompDomains = [...new Set(competitorGap.flatMap((g) => g.competitors.map((c) => c.domain)))]
            const filteredGap = gapCompFilter === 'all' ? competitorGap : competitorGap.filter((g) => g.competitors.some((c) => c.domain === gapCompFilter))
            return (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Keywords your ICP searches for where competitors rank and you don&apos;t — {filteredGap.length} gaps
                  </p>
                  {allCompDomains.length > 1 && (
                    <select value={gapCompFilter} onChange={(e) => setGapCompFilter(e.target.value)}
                      className="rounded-lg border border-border bg-input px-2 py-1 text-xs">
                      <option value="all">All competitors</option>
                      {allCompDomains.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </div>
                {filteredGap.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-2 text-xs">
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Keyword</th>
                          <th className="px-3 py-2 text-center font-medium">We Appear?</th>
                          <th className="px-3 py-2 text-center font-medium">Our Pos</th>
                          <th className="px-3 py-2 text-left font-medium">Who Ranks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGap.slice(0, 50).map((gap, i) => (
                          <tr key={i} className={`border-b border-border hover:bg-surface-2/50 ${!gap.weAppear ? 'bg-red-500/5' : ''}`}>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-1.5 font-medium">{gap.keyword}</td>
                            <td className="px-3 py-1.5 text-center">
                              {gap.weAppear
                                ? <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-300">Yes</span>
                                : <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">No — Gap</span>}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {gap.ourPosition ? <span className={gap.ourPosition <= 10 ? 'text-green-400 font-medium' : 'text-amber-400'}>{Math.round(gap.ourPosition)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {gap.competitors.map((c, j) => (
                                  <span key={j} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px]">
                                    {c.domain} <span className="text-muted-foreground">#{c.position}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
                    <p className="text-sm text-muted-foreground">No ICP-relevant keyword gaps found.</p>
                    <p className="text-xs text-muted-foreground mt-1">This could mean competitors have similar keyword profiles, or the analysis needs to be re-run.</p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ═══ Tab 3: ICP Alignment ═══ */}
          {tab === 'icp' && icpData && (() => {
            const filteredIcp = icpFilter === 'all' ? icpData.details : icpData.details.filter((d) => d.alignment === icpFilter)
            return (
              <div>
                <p className="mb-3 text-xs text-muted-foreground">
                  How well your current keywords match your Ideal Customer Profile
                </p>
                {/* ICP summary bar */}
                <div className="mb-3 flex h-4 rounded-full overflow-hidden bg-surface-2">
                  {icpData.aligned > 0 && <div className="bg-green-500" style={{ width: `${(icpData.aligned / icpData.details.length) * 100}%` }} />}
                  {icpData.misaligned > 0 && <div className="bg-amber-500" style={{ width: `${(icpData.misaligned / icpData.details.length) * 100}%` }} />}
                  {icpData.irrelevant > 0 && <div className="bg-red-500" style={{ width: `${(icpData.irrelevant / icpData.details.length) * 100}%` }} />}
                </div>

                {/* Clickable filter buttons */}
                <div className="mb-4 flex gap-2">
                  {([
                    { key: 'all' as const, label: 'All', count: icpData.details.length, color: '' },
                    { key: 'aligned' as const, label: 'Aligned', count: icpData.aligned, color: 'border-green-500/40' },
                    { key: 'misaligned' as const, label: 'Misaligned', count: icpData.misaligned, color: 'border-amber-500/40' },
                    { key: 'irrelevant' as const, label: 'Irrelevant', count: icpData.irrelevant, color: 'border-red-500/40' },
                  ]).map((f) => (
                    <button key={f.key} onClick={() => setIcpFilter(f.key)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                        icpFilter === f.key ? 'border-brand ring-1 ring-brand text-brand' : f.color || 'border-border'
                      } hover:border-muted-foreground/40`}>
                      {f.key !== 'all' && <span className={`h-2 w-2 rounded-full ${f.key === 'aligned' ? 'bg-green-500' : f.key === 'misaligned' ? 'bg-amber-500' : 'bg-red-500'}`} />}
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>

                {/* Filtered table */}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-2 text-xs">
                        <th className="px-3 py-2 text-left font-medium">#</th>
                        <th className="px-3 py-2 text-left font-medium">Keyword</th>
                        <th className="px-3 py-2 text-center font-medium">Alignment</th>
                        <th className="px-3 py-2 text-left font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIcp.map((d, i) => (
                        <tr key={i} className={`border-b border-border ${d.alignment === 'irrelevant' ? 'bg-red-500/5' : d.alignment === 'misaligned' ? 'bg-amber-500/5' : ''}`}>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium">{d.keyword}</td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${d.alignment === 'aligned' ? 'bg-green-500/20 text-green-300' : d.alignment === 'misaligned' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                              {d.alignment}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground">{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ═══ Tab 4: Opportunities ═══ */}
          {tab === 'opportunities' && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">
                Prioritized actions based on SERP features, keyword gaps, and ICP alignment
              </p>
              <div className="space-y-2">
                {opportunities.map((opp, i) => {
                  const typeInfo = typeLabels[opp.type] ?? { label: opp.type, color: 'bg-surface-2 text-foreground' }
                  return (
                    <div key={i} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted-foreground flex-shrink-0">{i + 1}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{opp.keyword}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${opp.impact === 'high' ? 'bg-green-500/20 text-green-300' : opp.impact === 'medium' ? 'bg-amber-500/20 text-amber-300' : 'bg-surface-2 text-muted-foreground'}`}>{opp.impact} impact</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{opp.action}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
