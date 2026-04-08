'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Map, Stethoscope, ChevronDown, ChevronRight, Search, Calendar, FileText, Network, ArrowUpDown } from 'lucide-react'
import { AnalysisProgress } from '@/components/analysis/analysis-progress'

interface ContentPiece {
  id: string; pillarName: string; pillarKeyword: string; clusterName: string | null; subClusterName: string | null
  contentType: string; title: string; targetKeyword: string; secondaryKeywords: string[]
  volume: number | null; kd: number | null; cpc: number | null; searchIntent: string; funnelStage: string
  contentCategory: string; status: string; existingUrl: string | null; currentPosition: number | null
  priority: string; publishWeek: number; publishDay: string
  linksTo: string[]; linksFrom: string[]; rationale: string; targetPersona: string
  published?: boolean; publishedDate?: string
}

interface ContentBrief {
  pieceId: string; title: string; targetKeyword: string; suggestedH2s: string[]
  wordCountTarget: number; eeat: { experience: string; expertise: string; authority: string; trust: string }
  paaToAnswer: string[]; internalLinkAnchors: Array<{ text: string; targetPage: string }>
  callToAction: string
}

interface LatestMap {
  id: string; status: string; quarter: string | null; mapData: string | null; briefs: string | null
  reviewResult: string | null; summary: string | null; createdAt: string | Date
}

type Tab = 'map' | 'calendar' | 'briefs' | 'pool'

const funnelColors: Record<string, string> = { tofu: 'bg-blue-500/20 text-blue-300', mofu: 'bg-amber-500/20 text-amber-300', bofu: 'bg-green-500/20 text-green-300' }
const statusColors: Record<string, string> = { exists: 'bg-green-500/20 text-green-300', to_create: 'bg-red-500/20 text-red-300', to_optimize: 'bg-amber-500/20 text-amber-300' }
const priorityColors: Record<string, string> = { high: 'bg-red-500/20 text-red-300', medium: 'bg-amber-500/20 text-amber-300', low: 'bg-surface-2 text-muted-foreground' }
const typeColors: Record<string, string> = { pillar: 'bg-brand/20 text-brand', cluster: 'bg-purple-500/20 text-purple-300', 'sub-cluster': 'bg-cyan-500/20 text-cyan-300' }
const categoryColors: Record<string, string> = { problem: 'bg-orange-500/20 text-orange-300', product: 'bg-blue-500/20 text-blue-300', purchase: 'bg-green-500/20 text-green-300', problema: 'bg-orange-500/20 text-orange-300', producto: 'bg-blue-500/20 text-blue-300', compra: 'bg-green-500/20 text-green-300' }
const categoryLabels: Record<string, string> = { problem: 'Problem', product: 'Product', purchase: 'Purchase', problema: 'Problem', producto: 'Product', compra: 'Purchase' }

interface MapEntry {
  id: string; name: string; quarter: string | null; keywordPool: string | null; mapData: string | null; briefs: string | null; summary: string | null; createdAt: string | Date; status: string
}

interface PoolKeyword {
  keyword: string; volume: number; kd: number | null; cpc: number | null; source: string; existingUrl: string | null; position: number | null; rationale?: string
}

export function ContentMapClient({ brand, hasDiagnostic, allMaps, latestMap }: { brand: { id: string; domain: string }; hasDiagnostic: boolean; allMaps: MapEntry[]; latestMap: LatestMap | null }) {
  const router = useRouter()
  const [runningId, setRunningId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('map')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPieces, setExpandedPieces] = useState<Set<string>>(new Set())
  const [pillarFilter, setPillarFilter] = useState<string>('all')
  const [funnelFilter, setFunnelFilter] = useState<string>('all')
  const [poolSortKey, setPoolSortKey] = useState<'volume' | 'kd' | 'cpc' | 'keyword'>('volume')
  const [poolSortDir, setPoolSortDir] = useState<'asc' | 'desc'>('desc')
  const [poolStatusFilter, setPoolStatusFilter] = useState<'all' | 'used' | 'new' | 'optimize'>('all')

  // Merge ALL content maps (accumulated months)
  const allPieces: ContentPiece[] = []
  const allBriefs: ContentBrief[] = []
  const allPoolKeywords: PoolKeyword[] = []
  const seenPoolKws = new Set<string>()
  for (const cm of allMaps) {
    if (cm.mapData) allPieces.push(...JSON.parse(cm.mapData))
    if (cm.briefs) allBriefs.push(...JSON.parse(cm.briefs))
    if (cm.keywordPool) {
      for (const kw of JSON.parse(cm.keywordPool)) {
        if (!seenPoolKws.has(kw.keyword.toLowerCase())) {
          seenPoolKws.add(kw.keyword.toLowerCase())
          allPoolKeywords.push(kw)
        }
      }
    }
  }
  allPoolKeywords.sort((a, b) => b.volume - a.volume)
  const pieces = allPieces
  const briefs = allBriefs
  const summary = allMaps.length > 0 ? allMaps[allMaps.length - 1].summary : null
  const hasData = pieces.length > 0

  const togglePiece = (id: string) => {
    const next = new Set(expandedPieces)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandedPieces(next)
  }

  const getBrief = (pieceId: string) => briefs.find((b) => b.pieceId === pieceId)
  const pillars = [...new Set(pieces.map((p) => p.pillarName))]
  const [expandingPillar, setExpandingPillar] = useState<string | null>(null)
  const [generatingBrief, setGeneratingBrief] = useState<string | null>(null)

  async function handleGenerateBrief(pieceId: string) {
    const mapId = allMaps.find((m) => {
      const data = m.mapData ? JSON.parse(m.mapData) : []
      return data.some((p: any) => p.id === pieceId)
    })?.id
    if (!mapId) return
    setGeneratingBrief(pieceId)
    try {
      await fetch('/api/content-map-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brand.id, action: 'generate-brief', contentMapId: mapId, pieceId }),
      })
      await new Promise((r) => setTimeout(r, 10000))
      router.refresh()
    } catch { /* ignore */ }
    setGeneratingBrief(null)
  }

  async function updatePiece(pieceId: string, updates: Record<string, any>) {
    const mapId = allMaps.find((m) => {
      const data = m.mapData ? JSON.parse(m.mapData) : []
      return data.some((p: any) => p.id === pieceId)
    })?.id
    if (!mapId) return
    await fetch('/api/content-map-gen/update-piece', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentMapId: mapId, pieceId, updates }),
    })
    router.refresh()
  }

  async function handleExpandPillar(pillarName: string) {
    if (!latestMap) return
    setExpandingPillar(pillarName)
    try {
      await fetch('/api/content-map-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brand.id, action: 'expand-pillar', pillarName, contentMapId: latestMap.id }),
      })
      // Wait a bit for processing then refresh
      await new Promise((r) => setTimeout(r, 15000))
      router.refresh()
    } catch { /* ignore */ }
    setExpandingPillar(null)
  }

  const filtered = pieces.filter((p) => {
    if (pillarFilter !== 'all' && p.pillarName !== pillarFilter) return false
    if (funnelFilter !== 'all' && p.funnelStage !== funnelFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.title.toLowerCase().includes(q) || p.targetKeyword.toLowerCase().includes(q) || p.pillarName.toLowerCase().includes(q)
    }
    return true
  })

  // Calendar view: group by month (content map) then by week
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set([0]))
  const calendarMonths = allMaps.map((cm, idx) => {
    const mapPieces: ContentPiece[] = cm.mapData ? JSON.parse(cm.mapData) : []
    const byWeek: Record<number, ContentPiece[]> = {}
    mapPieces.forEach((p) => { if (!byWeek[p.publishWeek]) byWeek[p.publishWeek] = []; byWeek[p.publishWeek].push(p) })
    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b)
    const published = mapPieces.filter((p) => p.published).length
    return { idx, name: cm.name ?? `Month ${idx + 1}`, mapId: cm.id, weeks, byWeek, total: mapPieces.length, published }
  })
  const toggleMonth = (idx: number) => {
    const next = new Set(expandedMonths)
    if (next.has(idx)) next.delete(idx); else next.add(idx)
    setExpandedMonths(next)
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

  async function handleRun() {
    setLoading(true)
    const res = await fetch('/api/content-map-gen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId: brand.id }) })
    const data = await res.json()
    if (data.error) { alert(data.error); setLoading(false); return }
    setRunningId(data.contentMapId)
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Content Map</h2>
          <p className="text-sm text-muted-foreground">Topical authority strategy with pillar/cluster/sub-cluster hierarchy</p>
          {hasData && <p className="text-[10px] text-muted-foreground mt-0.5">{allMaps.length} month(s) generated &middot; {pieces.length} total pieces &middot; {pieces.filter((p) => p.status === 'to_create').length} to create &middot; 3-4 per week</p>}
        </div>
        <button onClick={handleRun} disabled={loading || !!runningId}
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
          <Map className="h-4 w-4" />{loading ? 'Starting...' : hasData ? 'Generate Next Month' : 'Generate Content Map (Month 1)'}
        </button>
      </div>

      {runningId && <div className="mb-6"><AnalysisProgress pipelineId={runningId} type="content-map-gen" onComplete={() => { setRunningId(null); router.refresh() }} /></div>}

      {/* Strategy context */}
      {hasData && (
        <div className="mb-5 rounded-lg border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-brand mb-1">
                {allMaps.length === 1 ? 'Month 1 — Core Product Authority' : `Month ${allMaps.length} — Expanding Topical Authority`}
              </h4>
              <p className="text-xs text-muted-foreground">
                {`Each pillar has a mix of Product (50%), Problem (30%), and Purchase (20%) content to build complete topical authority. Clusters publish first, pillar last. Use "Generate Next Month" to expand with new keywords from the pool.`}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground flex-shrink-0">
              <div>{allPoolKeywords.length} keywords in pool</div>
              <div>{allPoolKeywords.filter((k) => !allPieces.some((p) => p.targetKeyword.toLowerCase() === k.keyword.toLowerCase())).length} available for next months</div>
            </div>
          </div>
        </div>
      )}

      {summary && <div className="mb-5 rounded-lg border border-border bg-card p-4"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary}</p></div>}

      {hasData && (
        <>
          {/* Stats */}
          <div className="mb-4 grid grid-cols-3 gap-3 md:grid-cols-6">
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold">{pieces.length}</div><div className="text-xs text-muted-foreground">Total Pieces</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold text-brand">{pillars.length}</div><div className="text-xs text-muted-foreground">Pillars</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold text-red-400">{pieces.filter((p) => p.status === 'to_create').length}</div><div className="text-xs text-muted-foreground">To Create</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold text-amber-400">{pieces.filter((p) => p.status === 'to_optimize').length}</div><div className="text-xs text-muted-foreground">To Optimize</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold text-green-400">{pieces.filter((p) => p.status === 'exists').length}</div><div className="text-xs text-muted-foreground">Exists</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold">{Math.ceil(pieces.length / 3)}</div><div className="text-xs text-muted-foreground">Weeks</div></div>
            <div className="rounded-lg bg-card p-3 text-center"><div className="text-xl font-bold">{briefs.length}</div><div className="text-xs text-muted-foreground">Briefs</div></div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-lg border border-border overflow-hidden w-fit text-xs">
            <button onClick={() => setTab('map')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'map' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}><Network className="h-3 w-3" />Content Map</button>
            <button onClick={() => setTab('calendar')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'calendar' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}><Calendar className="h-3 w-3" />Publishing Calendar</button>
            <button onClick={() => setTab('briefs')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'briefs' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}><FileText className="h-3 w-3" />Briefs ({briefs.length})</button>
            <button onClick={() => setTab('pool')} className={`flex items-center gap-1.5 px-3 py-1.5 font-medium ${tab === 'pool' ? 'bg-brand text-primary-foreground' : 'hover:bg-surface-2'}`}><Search className="h-3 w-3" />Keyword Pool ({allPoolKeywords.length})</button>
          </div>

          {/* Filters */}
          <div className="mb-3 flex gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..."
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-1.5 text-sm" />
            </div>
            <select value={pillarFilter} onChange={(e) => setPillarFilter(e.target.value)} className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs">
              <option value="all">All Pillars</option>
              {pillars.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)} className="rounded-lg border border-border bg-input px-2 py-1.5 text-xs">
              <option value="all">All Funnel</option>
              <option value="tofu">TOFU</option>
              <option value="mofu">MOFU</option>
              <option value="bofu">BOFU</option>
            </select>
          </div>

          {/* ═══ Content Map Tab ═══ */}
          {tab === 'map' && (
            <div className="space-y-4">
              {pillars.filter((p) => pillarFilter === 'all' || p === pillarFilter).map((pillarName) => {
                const pillarPieces = filtered.filter((p) => p.pillarName === pillarName)
                if (pillarPieces.length === 0) return null
                const pillarBriefs = briefs.filter((b) => pillarPieces.some((p) => p.id === b.pieceId))
                const hasBriefs = pillarBriefs.length > 0
                const toCreateCount = pillarPieces.filter((p) => p.status === 'to_create').length

                return (
                  <div key={pillarName} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Pillar header */}
                    <div className="bg-surface-2 px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-brand/20 px-2 py-0.5 text-xs font-medium text-brand">PILLAR</span>
                          <span className="font-medium">{pillarName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{pillarPieces.length} pieces &middot; {toCreateCount} to create &middot; {hasBriefs ? `${pillarBriefs.length} briefs` : 'no briefs yet'}</div>
                      </div>
                      {!hasBriefs && toCreateCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">Expand pieces to generate briefs individually</span>
                      )}
                    </div>

                    {/* Pieces under this pillar */}
                    <div className="divide-y divide-border/50">
              {pillarPieces.map((piece) => {
                const isOpen = expandedPieces.has(piece.id)
                const brief = getBrief(piece.id)
                return (
                  <div key={piece.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button onClick={() => togglePiece(piece.id)} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2/30 text-left">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColors[piece.contentType] ?? ''}`}>{piece.contentType}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{piece.title}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {piece.pillarName}{piece.clusterName ? ` → ${piece.clusterName}` : ''}
                          {piece.existingUrl && (piece.status === 'to_optimize' || piece.status === 'exists') && (
                            <span className="ml-2 text-brand">{piece.existingUrl}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${categoryColors[piece.contentCategory] ?? ''}`}>{categoryLabels[piece.contentCategory] ?? ''}</span>
                        <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${funnelColors[piece.funnelStage] ?? ''}`}>{piece.funnelStage.toUpperCase()}</span>
                        {piece.published
                          ? <span className="rounded bg-green-500/20 px-1 py-0.5 text-[9px] font-medium text-green-300">{piece.publishedDate ? `Published ${new Date(piece.publishedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Published'}</span>
                          : <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${statusColors[piece.status] ?? ''}`}>{piece.status.replace('_', ' ')}</span>}
                        <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${priorityColors[piece.priority] ?? ''}`}>{piece.priority}</span>
                        {piece.volume && <span className="text-[10px] text-muted-foreground">{piece.volume.toLocaleString()} vol</span>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border px-4 py-3 text-xs space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div><span className="text-muted-foreground">Keyword:</span> <strong>{piece.targetKeyword}</strong></div>
                            <div><span className="text-muted-foreground">Volume:</span> {piece.volume?.toLocaleString() ?? '—'} | <span className="text-muted-foreground">KD:</span> {piece.kd ?? '—'} | <span className="text-muted-foreground">CPC:</span> {piece.cpc ? `$${piece.cpc.toFixed(2)}` : '—'}</div>
                            <div><span className="text-muted-foreground">Intent:</span> {piece.searchIntent} | <span className="text-muted-foreground">Persona:</span> {piece.targetPersona}</div>
                            {piece.existingUrl && <div><span className="text-muted-foreground">Existing:</span> <span className="text-green-400">{piece.existingUrl}</span> (pos {piece.currentPosition})</div>}
                            <div><span className="text-muted-foreground">Publish:</span> Week {piece.publishWeek}, {piece.publishDay}</div>
                          </div>
                          <div className="space-y-1">
                            <div><span className="text-muted-foreground">Links TO:</span> {(piece.linksTo ?? []).join(', ') || 'none'}</div>
                            <div><span className="text-muted-foreground">Links FROM:</span> {(piece.linksFrom ?? []).join(', ') || 'none'}</div>
                            {piece.secondaryKeywords?.length > 0 && <div><span className="text-muted-foreground">Secondary:</span> {piece.secondaryKeywords.join(', ')}</div>}
                          </div>
                        </div>
                        <div><span className="text-muted-foreground">Rationale:</span> {piece.rationale}</div>
                        {brief ? (
                          <div className="rounded-lg bg-surface-2/50 p-3 space-y-2">
                            <h4 className="font-medium text-brand">Content Brief</h4>
                            <div><span className="text-muted-foreground">Word count:</span> {brief.wordCountTarget}</div>
                            <div><span className="text-muted-foreground">H2s:</span><ul className="mt-0.5 space-y-0.5">{brief.suggestedH2s.map((h, i) => <li key={i} className="text-muted-foreground">• {h}</li>)}</ul></div>
                            <div className="grid grid-cols-2 gap-2">
                              <div><span className="text-green-400">Experience:</span> {brief.eeat.experience}</div>
                              <div><span className="text-blue-400">Expertise:</span> {brief.eeat.expertise}</div>
                              <div><span className="text-purple-400">Authority:</span> {brief.eeat.authority}</div>
                              <div><span className="text-amber-400">Trust:</span> {brief.eeat.trust}</div>
                            </div>
                            {brief.paaToAnswer.length > 0 && <div><span className="text-muted-foreground">PAA to answer:</span> {brief.paaToAnswer.join(' • ')}</div>}
                            <div><span className="text-muted-foreground">CTA:</span> {brief.callToAction}</div>
                          </div>
                        ) : piece.status === 'to_create' ? (
                          <button onClick={(e) => { e.stopPropagation(); handleGenerateBrief(piece.id) }}
                            disabled={generatingBrief === piece.id}
                            className="flex items-center gap-1.5 rounded-lg bg-brand/20 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/30 disabled:opacity-50">
                            <FileText className="h-3 w-3" />
                            {generatingBrief === piece.id ? 'Generating...' : 'Generate Brief'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ Calendar Tab ═══ */}
          {tab === 'calendar' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">3 publications per week — check off as you publish</p>
                <p className="text-xs text-muted-foreground">
                  {pieces.filter((p) => p.published).length}/{pieces.length} published
                </p>
              </div>
              {calendarMonths.map((month) => (
                <div key={month.idx} className="rounded-lg border border-border overflow-hidden">
                  {/* Month header — collapsible */}
                  <button onClick={() => toggleMonth(month.idx)} className="w-full flex items-center justify-between bg-surface-2 px-4 py-2.5 hover:bg-surface-2/80">
                    <div className="flex items-center gap-2">
                      {expandedMonths.has(month.idx) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium text-sm">{month.name}</span>
                      <span className="text-xs text-muted-foreground">{month.total} pieces · {month.weeks.length} weeks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-surface overflow-hidden">
                        <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${month.total > 0 ? (month.published / month.total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{month.published}/{month.total}</span>
                    </div>
                  </button>

                  {/* Weeks — shown when month is expanded */}
                  {expandedMonths.has(month.idx) && (
                    <div className="divide-y divide-border">
                      {month.weeks.map((week) => {
                        const weekPieces = month.byWeek[week].sort((a, b) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(a.publishDay) - ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(b.publishDay))
                        return (
                          <div key={week}>
                            <div className="bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50">Week {week}</div>
                            {weekPieces.map((piece) => (
                              <div key={piece.id} className={`flex items-center gap-3 px-4 py-2 ${piece.published ? 'bg-green-500/5' : 'bg-card'}`}>
                                <button
                                  onClick={() => updatePiece(piece.id, { published: !piece.published })}
                                  className={`flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 ${piece.published ? 'border-green-500 bg-green-500 text-white' : 'border-muted-foreground/40 hover:border-brand'}`}
                                >
                                  {piece.published && <span className="text-[10px]">✓</span>}
                                </button>
                                <span className="w-7 text-[10px] font-medium text-muted-foreground">{piece.publishDay}</span>
                                <span className={`rounded px-1 py-0.5 text-[9px] font-medium flex-shrink-0 ${typeColors[piece.contentType] ?? ''}`}>{piece.contentType}</span>
                                <input
                                  defaultValue={piece.title}
                                  onBlur={(e) => { if (e.target.value !== piece.title) updatePiece(piece.id, { title: e.target.value }) }}
                                  className={`flex-1 bg-transparent text-xs border-none focus:outline-none focus:ring-1 focus:ring-brand rounded px-1 ${piece.published ? 'line-through text-muted-foreground' : ''}`}
                                />
                                <span className={`rounded px-1 py-0.5 text-[9px] font-medium flex-shrink-0 ${categoryColors[piece.contentCategory] ?? ''}`}>{categoryLabels[piece.contentCategory] ?? ''}</span>
                                <input
                                  type="date"
                                  value={piece.publishedDate ?? ''}
                                  onChange={(e) => updatePiece(piece.id, { publishedDate: e.target.value, published: !!e.target.value })}
                                  className="bg-transparent border border-border rounded px-1 py-0.5 text-[10px] text-muted-foreground w-28 focus:outline-none focus:border-brand"
                                />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ═══ Briefs Tab ═══ */}
          {tab === 'briefs' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{briefs.length} content briefs for new pieces — with E-E-A-T guidelines and internal linking</p>
              {briefs.map((brief) => {
                const piece = pieces.find((p) => p.id === brief.pieceId)
                return (
                  <div key={brief.pieceId} className="rounded-lg border border-border bg-card p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium">{brief.title}</h3>
                        <span className="text-muted-foreground">Keyword: {brief.targetKeyword} | {brief.wordCountTarget} words</span>
                      </div>
                      {piece && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${funnelColors[piece.funnelStage] ?? ''}`}>{piece.funnelStage.toUpperCase()}</span>}
                    </div>
                    <div>
                      <h4 className="font-medium mb-1">Suggested H2s:</h4>
                      <ol className="space-y-0.5 text-muted-foreground list-decimal list-inside">{brief.suggestedH2s.map((h, i) => <li key={i}>{h}</li>)}</ol>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2/50 p-2">
                      <div><span className="text-green-400 font-medium">Experience:</span> {brief.eeat.experience}</div>
                      <div><span className="text-blue-400 font-medium">Expertise:</span> {brief.eeat.expertise}</div>
                      <div><span className="text-purple-400 font-medium">Authority:</span> {brief.eeat.authority}</div>
                      <div><span className="text-amber-400 font-medium">Trust:</span> {brief.eeat.trust}</div>
                    </div>
                    {brief.internalLinkAnchors.length > 0 && (
                      <div><h4 className="font-medium mb-1">Internal Links:</h4>{brief.internalLinkAnchors.map((l, i) => <div key={i} className="text-muted-foreground">Link &quot;{l.text}&quot; → {l.targetPage}</div>)}</div>
                    )}
                    <div><span className="font-medium">CTA:</span> <span className="text-brand">{brief.callToAction}</span></div>
                  </div>
                )
              })}
              {briefs.length === 0 && <p className="text-sm text-muted-foreground p-4">No briefs yet. Generate a content map first.</p>}
            </div>
          )}

          {/* ═══ Keyword Pool Tab ═══ */}
          {tab === 'pool' && (() => {
            const usedKws = new Set(allPieces.map((p) => p.targetKeyword.toLowerCase()))
            // Separate: keywords with existing dedicated pages (not homepage) vs new opportunities
            const hasExistingPage = (k: any) => k.existingUrl && k.existingUrl !== '/' && k.existingUrl !== ''
            const poolNewContent = allPoolKeywords.filter((k) => !hasExistingPage(k) && !usedKws.has(k.keyword.toLowerCase()))
            const poolOptimize = allPoolKeywords.filter((k) => hasExistingPage(k) && !usedKws.has(k.keyword.toLowerCase()))
            const poolFiltered = allPoolKeywords
              .filter((k) => !searchQuery || k.keyword.toLowerCase().includes(searchQuery.toLowerCase()))
              .filter((k) => poolStatusFilter === 'all' ? true : poolStatusFilter === 'used' ? usedKws.has(k.keyword.toLowerCase()) : poolStatusFilter === 'new' ? (!hasExistingPage(k) && !usedKws.has(k.keyword.toLowerCase())) : poolStatusFilter === 'optimize' ? (hasExistingPage(k) && !usedKws.has(k.keyword.toLowerCase())) : !usedKws.has(k.keyword.toLowerCase()))
              .sort((a, b) => {
                const av = poolSortKey === 'keyword' ? a.keyword : poolSortKey === 'volume' ? a.volume : poolSortKey === 'kd' ? (a.kd ?? 999) : (a.cpc ?? 0)
                const bv = poolSortKey === 'keyword' ? b.keyword : poolSortKey === 'volume' ? b.volume : poolSortKey === 'kd' ? (b.kd ?? 999) : (b.cpc ?? 0)
                if (poolSortKey === 'keyword') return poolSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
                return poolSortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
              })
            const poolUsed = allPoolKeywords.filter((k) => usedKws.has(k.keyword.toLowerCase()))
            const poolAvailable = allPoolKeywords.filter((k) => !usedKws.has(k.keyword.toLowerCase()))

            // Group available by topic for pillar preview
            const topicGroups: Record<string, typeof poolAvailable> = { product: [], problem: [], shoulder: [] }
            poolAvailable.forEach((k) => {
              const r = (k.rationale ?? '').toLowerCase()
              if (r.includes('product')) topicGroups.product.push(k)
              else if (r.includes('problem') || r.includes('pain')) topicGroups.problem.push(k)
              else topicGroups.shoulder.push(k)
            })

            return (
              <div>
                {/* Clickable stats cards */}
                <div className="mb-4 grid grid-cols-5 gap-3">
                  <button onClick={() => setPoolStatusFilter(poolStatusFilter === 'all' ? 'all' : 'all')}
                    className={`rounded-lg bg-card p-3 text-center transition-all ${poolStatusFilter === 'all' ? 'border border-brand ring-1 ring-brand' : 'border border-transparent hover:border-muted-foreground/30'}`}>
                    <div className="text-xl font-bold">{allPoolKeywords.length}</div>
                    <div className="text-xs text-muted-foreground">All Keywords</div>
                  </button>
                  <button onClick={() => setPoolStatusFilter(poolStatusFilter === 'new' ? 'all' : 'new')}
                    className={`rounded-lg bg-card p-3 text-center transition-all ${poolStatusFilter === 'new' ? 'border border-brand ring-1 ring-brand' : 'border border-transparent hover:border-muted-foreground/30'}`}>
                    <div className="text-xl font-bold text-brand">{poolNewContent.length}</div>
                    <div className="text-xs text-muted-foreground">New Content</div>
                  </button>
                  <button onClick={() => setPoolStatusFilter(poolStatusFilter === 'optimize' ? 'all' : 'optimize')}
                    className={`rounded-lg bg-card p-3 text-center transition-all ${poolStatusFilter === 'optimize' ? 'border border-amber-500 ring-1 ring-amber-500' : 'border border-transparent hover:border-muted-foreground/30'}`}>
                    <div className="text-xl font-bold text-amber-400">{poolOptimize.length}</div>
                    <div className="text-xs text-muted-foreground">Optimize Existing</div>
                  </button>
                  <button onClick={() => setPoolStatusFilter(poolStatusFilter === 'used' ? 'all' : 'used')}
                    className={`rounded-lg bg-card p-3 text-center transition-all ${poolStatusFilter === 'used' ? 'border border-green-500 ring-1 ring-green-500' : 'border border-transparent hover:border-muted-foreground/30'}`}>
                    <div className="text-xl font-bold text-green-400">{poolUsed.length}</div>
                    <div className="text-xs text-muted-foreground">In Content Map</div>
                  </button>
                  <div className="rounded-lg bg-card p-3 text-center border border-transparent">
                    <div className="text-xl font-bold">{Math.ceil(poolNewContent.length / 14)}</div>
                    <div className="text-xs text-muted-foreground">Months of Content</div>
                  </div>
                </div>

                {/* Table */}
                {allPoolKeywords.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-2">
                          <th className="px-3 py-2 text-left font-medium cursor-pointer hover:text-brand" onClick={() => { if (poolSortKey === 'keyword') setPoolSortDir(poolSortDir === 'asc' ? 'desc' : 'asc'); else { setPoolSortKey('keyword'); setPoolSortDir('asc') } }}>
                            Keyword <ArrowUpDown className={`inline h-3 w-3 ${poolSortKey === 'keyword' ? 'text-brand' : 'text-muted-foreground/40'}`} />
                          </th>
                          <th className="px-2 py-2 text-right font-medium cursor-pointer hover:text-brand" onClick={() => { if (poolSortKey === 'volume') setPoolSortDir(poolSortDir === 'asc' ? 'desc' : 'asc'); else { setPoolSortKey('volume'); setPoolSortDir('desc') } }}>
                            Volume <ArrowUpDown className={`inline h-3 w-3 ${poolSortKey === 'volume' ? 'text-brand' : 'text-muted-foreground/40'}`} />
                          </th>
                          <th className="px-2 py-2 text-right font-medium cursor-pointer hover:text-brand" onClick={() => { if (poolSortKey === 'kd') setPoolSortDir(poolSortDir === 'asc' ? 'desc' : 'asc'); else { setPoolSortKey('kd'); setPoolSortDir('asc') } }}>
                            KD <ArrowUpDown className={`inline h-3 w-3 ${poolSortKey === 'kd' ? 'text-brand' : 'text-muted-foreground/40'}`} />
                          </th>
                          <th className="px-2 py-2 text-right font-medium cursor-pointer hover:text-brand" onClick={() => { if (poolSortKey === 'cpc') setPoolSortDir(poolSortDir === 'asc' ? 'desc' : 'asc'); else { setPoolSortKey('cpc'); setPoolSortDir('desc') } }}>
                            CPC <ArrowUpDown className={`inline h-3 w-3 ${poolSortKey === 'cpc' ? 'text-brand' : 'text-muted-foreground/40'}`} />
                          </th>
                          <th className="px-2 py-2 text-center font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Why this keyword</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poolFiltered.map((kw, i) => {
                          const isUsed = usedKws.has(kw.keyword.toLowerCase())
                          const piece = allPieces.find((p) => p.targetKeyword.toLowerCase() === kw.keyword.toLowerCase())
                          return (
                            <tr key={i} className={`border-b border-border/50 hover:bg-surface-2/30 ${isUsed ? 'bg-green-500/5' : ''}`}>
                              <td className="px-3 py-1.5">
                                <div className="font-medium">{kw.keyword}</div>
                                {kw.existingUrl && <div className="text-[10px] text-muted-foreground">{kw.existingUrl}</div>}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium">{kw.volume.toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-right">
                                {kw.kd != null ? <span className={kw.kd <= 30 ? 'text-green-400' : kw.kd <= 60 ? 'text-amber-400' : 'text-red-400'}>{kw.kd}</span> : '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{kw.cpc ? `$${kw.cpc.toFixed(2)}` : '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                {isUsed ? (
                                  piece?.published ? (
                                    <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-300" title={piece.publishedDate ?? ''}>
                                      {piece.publishedDate ? new Date(piece.publishedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Published'}
                                    </span>
                                  ) : (
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${piece?.contentType === 'pillar' ? 'bg-brand/20 text-brand' : 'bg-purple-500/20 text-purple-300'}`} title={piece ? `${piece.pillarName} → ${piece.clusterName ?? 'pillar'}` : ''}>
                                      {piece?.contentType === 'pillar' ? 'Pillar' : 'Cluster'}
                                    </span>
                                  )
                                ) : hasExistingPage(kw) ? (
                                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Optimize</span>
                                ) : (
                                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">New</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{kw.rationale}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4">Generate a content map to build the keyword pool.</p>
                )}
              </div>
            )
          })()}
        </>
      )}

      {!hasData && !runningId && (
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col items-center text-center mb-6">
            <Map className="mb-3 h-10 w-10 text-brand" />
            <h3 className="text-lg font-semibold">Generate Your Content Map</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Topical authority strategy with pillar/cluster content for maximum SEO impact
            </p>
          </div>

          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
              <div>
                <span className="text-foreground font-medium">1-2 pillars focused on your core product</span>
                <span className="ml-1">with 12-16 cluster pieces per month (3/week)</span>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
              <div>
                <span className="text-foreground font-medium">Balanced mix per pillar:</span>
                <div className="flex gap-2 mt-1.5">
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-300">50% Product</span>
                  <span className="rounded bg-orange-500/20 px-2 py-0.5 text-orange-300">30% Problem</span>
                  <span className="rounded bg-green-500/20 px-2 py-0.5 text-green-300">20% Purchase</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/20 text-brand text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
              <div>
                <span className="text-foreground font-medium">Clusters first, pillar last</span>
                <span className="ml-1">— each month builds on previous. Keywords validated with DataForSEO.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
