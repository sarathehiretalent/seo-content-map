import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { PoolKeyword } from './keyword-pool-builder'

export interface ContentMapPiece {
  id: string
  pillarName: string
  pillarKeyword: string
  clusterName: string | null
  subClusterName: string | null
  contentType: 'pillar' | 'cluster' | 'sub-cluster'
  title: string
  targetKeyword: string
  secondaryKeywords: string[]
  volume: number | null
  kd: number | null
  cpc: number | null
  searchIntent: string
  funnelStage: string
  contentCategory: 'problem' | 'product' | 'purchase'
  status: 'exists' | 'to_create' | 'to_optimize'
  existingUrl: string | null
  currentPosition: number | null
  priority: 'high' | 'medium' | 'low'
  publishWeek: number
  publishDay: string
  linksTo: string[]
  linksFrom: string[]
  rationale: string
  targetPersona: string
}

export async function runContentStrategist(
  brandId: string,
  keywordPool: PoolKeyword[]
): Promise<ContentMapPiece[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  const kwsWithVolume = keywordPool.filter((k) => k.volume > 0)
  console.log(`[ContentStrategist] Pool: ${kwsWithVolume.length} keywords with volume`)

  // Build comprehensive existing page map from GSC keywords
  const allGscKws = await prisma.keyword.findMany({
    where: { brandId, pageUrl: { not: null }, impressions: { gt: 0 } },
    select: { query: true, pageUrl: true, position: true },
    orderBy: { impressions: 'desc' },
  })

  // Map: keyword → existing page
  const kwToPage = new Map<string, { url: string; path: string; position: number }>()
  for (const kw of allGscKws) {
    if (!kw.pageUrl) continue
    const path = kw.pageUrl.replace(`https://${brand.domain}`, '')
    kwToPage.set(kw.query.toLowerCase(), { url: kw.pageUrl, path, position: kw.position })
  }

  // Map: page path → top keyword (for linking)
  const pageToKw = new Map<string, string>()
  for (const kw of allGscKws) {
    if (!kw.pageUrl) continue
    const path = kw.pageUrl.replace(`https://${brand.domain}`, '')
    if (!pageToKw.has(path)) pageToKw.set(path, kw.query)
  }

  const existingPages = [...pageToKw.entries()].slice(0, 15).map(([path, kw]) => `${path} (${kw})`)

  // Function to find if a keyword matches an existing page
  function findExisting(keyword: string): { path: string; position: number } | null {
    // 1. Exact keyword match in GSC — this keyword is already ranking
    const exact = kwToPage.get(keyword.toLowerCase())
    if (exact) return { path: exact.path, position: exact.position }

    // 2. Exact slug match — URL was clearly built for this keyword
    const slug = keyword.toLowerCase().replace(/\s+/g, '-')
    for (const [path] of pageToKw) {
      if (path.toLowerCase().includes('/' + slug) || path.toLowerCase().includes(slug + '/')) {
        const kw = allGscKws.find((k) => k.pageUrl?.replace(`https://${brand.domain}`, '') === path)
        return kw ? { path, position: kw.position } : null
      }
    }

    // Conservative: don't force matches. If it's not exact, it's a new keyword opportunity.
    return null
  }

  console.log(`[ContentStrategist] Existing pages: ${pageToKw.size}, keyword→page mappings: ${kwToPage.size}`)

  // ── Step A: Pre-group product keywords and send to Claude ──
  const topKws = kwsWithVolume.slice(0, 80)

  // Pre-group: find keywords related to core product terms (dynamic from brand)
  const productGroups: Record<string, typeof topKws> = {}
  // Extract stem words from brand products + target keywords
  const coreProductWords = (brand.coreProducts ?? brand.name).toLowerCase().split(/[,.\-\n]+/).map((s: string) => s.trim()).filter((s: string) => s.length >= 3)
  const clientKws: string[] = brand.targetKeywords ? brand.targetKeywords.split(/[\n,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean) : []
  const coreStemWords = [...new Set([...coreProductWords, ...clientKws])].slice(0, 10)

  for (const kw of topKws) {
    const kwLower = kw.keyword.toLowerCase()
    let matched = false
    for (const stem of coreStemWords) {
      if (kwLower.includes(stem)) {
        if (!productGroups[stem]) productGroups[stem] = []
        productGroups[stem].push(kw)
        matched = true
        break
      }
    }
    if (!matched) {
      if (!productGroups['other']) productGroups['other'] = []
      productGroups['other'].push(kw)
    }
  }

  // Build a structured summary for Claude
  const groupSummary = Object.entries(productGroups)
    .filter(([key]) => key !== 'other')
    .map(([stem, kws]) => `"${stem}" group (${kws.length} keywords): ${kws.slice(0, 8).map((k) => k.keyword + '(' + k.volume + ')').join(', ')}${kws.length > 8 ? ' +' + (kws.length - 8) + ' more' : ''}`)
    .join('\n')

  const otherKws = productGroups['other'] ?? []

  console.log(`[ContentStrategist] Keyword groups: ${Object.entries(productGroups).map(([k, v]) => k + ':' + v.length).join(', ')}`)

  const groupResult = await callClaude<{ pillars: Array<{ name: string; keyword: string; volume: number; clusterKeywords: string[] }> }>({
    system: `You are a senior SEO strategist building a topical authority content plan for a B2B company.

BRAND: ${brand.name}
CORE PRODUCT: ${brand.coreProducts?.substring(0, 200) ?? ''}

YOUR TASK: Select 1-2 PILLAR keywords and group clusters under them for 1 month of content.

CRITICAL RULE — PILLAR SELECTION:
The pillar keyword MUST be directly about the brand's CORE PRODUCT or SERVICE.
- YES: keywords that describe what the brand SELLS or does
- NO: general industry topics, broad problems, or shoulder topics — those are for LATER months

For THIS month, the pillars must be the product itself. Shoulder topics come in future months.
${clientKws.length > 0 ? `\nCLIENT PRIORITY KEYWORDS (must include if relevant): ${clientKws.join(', ')}` : ''}

CLUSTER MIX under each pillar:
- ~50% PRODUCT: about the product/service itself (types, examples, how it works, questions)
- ~30% PROBLEM: problems the product solves — pain points the target audience faces
- ~20% PURCHASE: buying signals (vs competitors, ROI, pricing, implementation, case studies)

This mix means the pillar covers the topic from every angle: what it is, why you need it, and how to buy it.

RULES:
- 1-2 pillars, 5-8 clusters each, 12-16 total pieces
- Pillar keyword = a keyword FROM THE LIST that is directly about the product
- Clusters can include problem/purchase keywords but they must connect back to the product

JSON only.`,
    prompt: `Build 1-2 pillars from these PRODUCT keyword groups:

${groupSummary}

PROBLEM/PURCHASE keywords to include as clusters (2-3 from here per pillar):
${otherKws.slice(0, 10).map((k) => k.keyword + '(' + k.volume + ')').join(', ')}

INSTRUCTIONS:
- The group with MOST keywords should be the PRIMARY pillar (give it 6-8 clusters)
- Use the HIGHEST VOLUME keyword from each group as the pillar keyword
- Pick the best 5-8 clusters per pillar from the group + 2-3 problem/purchase from "other"
- If one product group has 30+ keywords, give that group the most clusters
- Total: 12-16 pieces across all pillars

Return: { "pillars": [{ "name": "Pillar name", "keyword": "exact keyword from the groups", "volume": 720, "clusterKeywords": ["kw1", "kw2"] }] }`,
    maxTokens: 2000,
  })

  const pillars = groupResult.pillars ?? []
  console.log(`[ContentStrategist] ${pillars.length} pillars: ${pillars.map((p) => `${p.keyword} (vol:${p.volume})`).join(', ')}`)

  // ── Step B: For each pillar, create content pieces ──
  const allPieces: ContentMapPiece[] = []
  // Pieces are collected first, scheduled at the end

  // Build keyword lookup
  const kwLookup = new Map(kwsWithVolume.map((k) => [k.keyword.toLowerCase(), k]))

  for (const pillar of pillars) {
    const clusterKws = pillar.clusterKeywords
      .map((kw) => kwLookup.get(kw.toLowerCase()))
      .filter((k): k is PoolKeyword => k != null && k.volume > 0)

    if (clusterKws.length === 0) continue

    // Classify and create pieces for clusters
    const classifyResult = await callClaude<{ pieces: Array<{ keyword: string; title: string; intent: string; funnel: string; category: string; persona: string; rationale: string }> }>({
      system: `Create content pieces from keywords. Classify each. JSON only.`,
      prompt: `Pillar: ${pillar.name} (${pillar.keyword})
Keywords to create content for:
${clusterKws.map((k) => `"${k.keyword}" vol:${k.volume}${k.existingUrl ? ' EXISTS:' + k.existingUrl : ''}`).join('\n')}

EXISTING PAGES (for linksTo):
${existingPages.slice(0, 10).join('\n')}

For each keyword return:
{ "pieces": [{
  "keyword": "exact keyword",
  "title": "SEO article title (keyword-focused, compelling)",
  "intent": "informational|commercial|transactional",
  "funnel": "tofu|mofu|bofu",
  "category": "problem|product|purchase",
  "persona": "CEO|Business Owner|HR Director|VP Operations|CFO|Risk Manager",
  "rationale": "1 sentence — what business problem this addresses"
}] }

Categories:
- "problem": about a PROBLEM the audience has — pain points they face before needing the product
- "product": about the PRODUCT/SERVICE — what it is, how it works, types, examples
- "purchase": about BUYING — pricing, ROI, comparison, implementation, case study`,
      maxTokens: 3000,
    })

    const pieces = classifyResult.pieces ?? []

    // Create cluster pieces (publish first)
    // Collect cluster titles for pillar linking
    const clusterTitles: string[] = []

    for (const piece of pieces) {
      const poolKw = kwLookup.get(piece.keyword.toLowerCase())
      if (!poolKw) continue

      // Check if this keyword has an existing page
      const existing = findExisting(piece.keyword)
      const status = existing ? (existing.position <= 20 ? 'exists' : 'to_optimize') : poolKw.existingUrl ? 'exists' : 'to_create'
      const existingPath = existing?.path ?? poolKw.existingUrl ?? null

      clusterTitles.push(piece.title)

      allPieces.push({
        id: `${pillar.name}-${allPieces.length}`,
        pillarName: pillar.name,
        pillarKeyword: pillar.keyword,
        clusterName: piece.keyword,
        subClusterName: null,
        contentType: 'cluster',
        title: piece.title,
        targetKeyword: piece.keyword,
        secondaryKeywords: [],
        volume: poolKw.volume,
        kd: poolKw.kd,
        cpc: poolKw.cpc,
        searchIntent: piece.intent || 'informational',
        funnelStage: piece.funnel || 'tofu',
        contentCategory: (piece.category as any) || 'product',
        status,
        existingUrl: existingPath,
        currentPosition: existing?.position ?? poolKw.position,
        priority: poolKw.volume >= 500 ? 'high' : poolKw.volume >= 100 ? 'medium' : 'low',
        publishWeek: 0,
        publishDay: '',
        linksTo: [`${pillar.name} (pillar)`],
        linksFrom: [],
        rationale: piece.rationale || '',
        targetPersona: piece.persona || '',
      })
    }

    // Create pillar piece (publish last — after all its clusters)
    const pillarKw = kwLookup.get(pillar.keyword.toLowerCase())

    const pillarExisting = findExisting(pillar.keyword)
    const pillarStatus = pillarExisting ? 'exists' : pillarKw?.existingUrl ? 'exists' : 'to_create'
    const pillarPath = pillarExisting?.path ?? pillarKw?.existingUrl ?? null

    // Add sibling links to clusters (each cluster links to 1-2 siblings)
    const clusterPieces = allPieces.filter((p) => p.pillarName === pillar.name && p.contentType === 'cluster')
    for (let ci = 0; ci < clusterPieces.length; ci++) {
      const siblings = clusterPieces.filter((_, si) => si !== ci).slice(0, 2).map((s) => s.title)
      clusterPieces[ci].linksTo = [`${pillar.name}: Complete Guide (pillar)`, ...siblings]
      clusterPieces[ci].linksFrom = [`${pillar.name}: Complete Guide (pillar)`]
    }

    allPieces.push({
      id: `${pillar.name}-pillar`,
      pillarName: pillar.name,
      pillarKeyword: pillar.keyword,
      clusterName: null,
      subClusterName: null,
      contentType: 'pillar',
      title: `${pillar.name}: Complete Guide`,
      targetKeyword: pillar.keyword,
      secondaryKeywords: clusterKws.map((k) => k.keyword),
      volume: pillarKw?.volume ?? pillar.volume ?? null,
      kd: pillarKw?.kd ?? null,
      cpc: pillarKw?.cpc ?? null,
      searchIntent: 'informational',
      funnelStage: 'mofu',
      contentCategory: 'product',
      status: pillarStatus,
      existingUrl: pillarPath,
      currentPosition: pillarExisting?.position ?? pillarKw?.position ?? null,
      priority: 'high',
      publishWeek: 0,
      publishDay: '',
      linksTo: clusterTitles,
      linksFrom: clusterTitles,
      rationale: `Comprehensive pillar page connecting all ${pillar.name} cluster content`,
      targetPersona: '',
    })
    // Scheduling happens after all pieces are collected
  }

  // ── Schedule: clusters first per pillar, pillar last, 3 per week consistently ──
  const POSTS_PER_WEEK = 3
  const publishDays = ['Mon', 'Wed', 'Fri']

  // Order: all clusters for pillar 1, then pillar 1, then clusters for pillar 2, then pillar 2, etc.
  const ordered: ContentMapPiece[] = []
  for (const pillarName of [...new Set(allPieces.map((p) => p.pillarName))]) {
    const clusters = allPieces.filter((p) => p.pillarName === pillarName && p.contentType === 'cluster')
    const pillar = allPieces.find((p) => p.pillarName === pillarName && p.contentType === 'pillar')
    ordered.push(...clusters)
    if (pillar) ordered.push(pillar)
  }

  // Assign weeks and days: exactly 3 per week
  for (let i = 0; i < ordered.length; i++) {
    const week = Math.floor(i / POSTS_PER_WEEK) + 1
    const dayIdx = i % POSTS_PER_WEEK
    ordered[i].publishWeek = week
    ordered[i].publishDay = publishDays[dayIdx]
  }

  const stats = {
    total: ordered.length,
    create: ordered.filter((p) => p.status === 'to_create').length,
    exists: ordered.filter((p) => p.status === 'exists').length,
    problem: ordered.filter((p) => p.contentCategory === 'problem').length,
    product: ordered.filter((p) => p.contentCategory === 'product').length,
    purchase: ordered.filter((p) => p.contentCategory === 'purchase').length,
    weeks: Math.ceil(ordered.length / POSTS_PER_WEEK),
  }
  console.log(`[ContentStrategist] ${stats.total} pieces in ${stats.weeks} weeks (new:${stats.create} exists:${stats.exists}) | Mix: problem:${stats.problem} product:${stats.product} purchase:${stats.purchase}`)

  return ordered
}
