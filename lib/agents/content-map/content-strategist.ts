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
  publishMonth: number
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
    if (exact && exact.path !== '/' && exact.path !== '') return { path: exact.path, position: exact.position }

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

  // ── Step A: Group keywords by their classification (Product/Problem/Purchase/Shoulder) ──
  const topKws = kwsWithVolume.slice(0, 100)
  const clientKws: string[] = brand.targetKeywords ? brand.targetKeywords.split(/[\n,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean) : []

  // Parse category from rationale (set by pool builder)
  const getCategory = (kw: PoolKeyword): string => {
    const r = (kw.rationale ?? '').toLowerCase()
    if (r.startsWith('product')) return 'product'
    if (r.startsWith('problem')) return 'problem'
    if (r.startsWith('purchase')) return 'purchase'
    if (r.startsWith('shoulder')) return 'shoulder'
    return 'product' // default to product if unknown
  }

  const productKws = topKws.filter(k => getCategory(k) === 'product')
  const problemKws = topKws.filter(k => getCategory(k) === 'problem')
  const purchaseKws = topKws.filter(k => getCategory(k) === 'purchase')
  const shoulderKws = topKws.filter(k => getCategory(k) === 'shoulder')

  console.log(`[ContentStrategist] By category: ${productKws.length} product, ${problemKws.length} problem, ${purchaseKws.length} purchase, ${shoulderKws.length} shoulder`)

  const groupResult = await callClaude<{ pillars: Array<{ name: string; keyword: string; volume: number; clusterKeywords: string[]; clusterMonths?: Record<string, number> }> }>({
    system: `You are a senior SEO strategist building a topical authority content plan for a B2B company.

BRAND: ${brand.name}
CORE PRODUCT: ${brand.coreProducts?.substring(0, 200) ?? ''}

YOUR TASK: Build a COMPLETE topical authority strategy (3 months) that generates organic traffic and positions the brand as the #1 authority in its product category.
${clientKws.length > 0 ? `\nCLIENT PRIORITY KEYWORDS: ${clientKws.join(', ')}` : ''}

PILLAR STRATEGY:
- Create 2-4 pillars total for the full strategy
- At least 1 pillar MUST be the core PRODUCT (the brand's main product/service)
- Other pillars can be: a second product angle, a major PROBLEM the product solves, or a high-volume category
- Every pillar must have a clear path to the product — someone reading any article should understand how the product helps

CLUSTER MIX per pillar:
- ~60-70% PRODUCT clusters: variations, types, how it works, examples, FAQ
- ~20-25% PROBLEM clusters: pain points the product solves — high TOFU traffic
- ~10-15% SHOULDER/PURCHASE clusters: adjacent topics, comparisons, pricing, ROI

MONTH ASSIGNMENT — assign each cluster to a month:
- Month 1: Core product clusters + high-priority problems (build product authority first)
- Month 2: Expand product coverage + more problem/purchase clusters
- Month 3: Shoulder topics, remaining clusters, content gaps
- Each month should have 12-16 pieces (3/week)
- Publish clusters first within each month, pillar article last

RULES:
- Do NOT duplicate keywords across pillars
- Do NOT include branded keywords (the brand's own name)
- Include ALL relevant product keywords — don't skip them for high-volume shoulder topics
- Every cluster must connect back to the pillar

JSON only.`,
    prompt: `Build a 3-month content strategy from these classified keywords:

PRODUCT keywords (${productKws.length} total — use for pillars + majority of clusters):
${productKws.slice(0, 40).map((k) => k.keyword + ' (' + k.volume + ')').join('\n')}

PROBLEM keywords (${problemKws.length} total — pain points the product solves):
${problemKws.slice(0, 15).map((k) => k.keyword + ' (' + k.volume + ')').join('\n')}

PURCHASE keywords (${purchaseKws.length} total — buying intent):
${purchaseKws.slice(0, 10).map((k) => k.keyword + ' (' + k.volume + ')').join('\n')}

SHOULDER keywords (${shoulderKws.length} total — adjacent high-volume topics):
${shoulderKws.slice(0, 10).map((k) => k.keyword + ' (' + k.volume + ')').join('\n')}

CREATE:
- 2-4 pillars covering the product from different angles
- Each pillar with enough clusters to fully cover the topic
- Assign each cluster a month: 1, 2, or 3
- Month 1: ~12-16 pieces (product-heavy), Month 2: ~12-16 (expand), Month 3: ~12-16 (shoulder + gaps)
- Total: 36-48 pieces across 3 months

Return: { "pillars": [{ "name": "Pillar name", "keyword": "exact keyword from list", "volume": 720, "clusterKeywords": ["kw1", "kw2"], "clusterMonths": {"kw1": 1, "kw2": 2} }] }`,
    maxTokens: 4000,
  })

  const pillars = groupResult.pillars ?? []
  console.log(`[ContentStrategist] ${pillars.length} pillars: ${pillars.map((p) => `${p.keyword} (vol:${p.volume})`).join(', ')}`)

  // ── Step B: For each pillar, create content pieces ──
  const allPieces: ContentMapPiece[] = []
  // Pieces are collected first, scheduled at the end

  // Build keyword lookup
  const kwLookup = new Map(kwsWithVolume.map((k) => [k.keyword.toLowerCase(), k]))

  for (const pillar of pillars) {
    const clusterMonths: Record<string, number> = pillar.clusterMonths ?? {}
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

      // Check if this keyword has an existing DEDICATED page (not homepage)
      const existing = findExisting(piece.keyword)
      const existingUrl = poolKw.existingUrl
      const isHomepage = !existingUrl || existingUrl === '/' || existingUrl === ''
      const hasDedicatedPage = existing || (!isHomepage && existingUrl)
      const status = hasDedicatedPage
        ? (existing && existing.position <= 20 ? 'exists' : 'to_optimize')
        : 'to_create'
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
        contentCategory: (piece.category as any) || getCategory(poolKw) || 'product',
        status,
        existingUrl: existingPath,
        currentPosition: existing?.position ?? poolKw.position,
        priority: poolKw.volume >= 500 ? 'high' : poolKw.volume >= 100 ? 'medium' : 'low',
        publishWeek: 0,
        publishDay: '',
        publishMonth: clusterMonths[piece.keyword.toLowerCase()] ?? clusterMonths[piece.keyword] ?? 1,
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
      publishMonth: 1, // Pillar publishes at end of month 1
      linksTo: clusterTitles,
      linksFrom: clusterTitles,
      rationale: `Comprehensive pillar page connecting all ${pillar.name} cluster content`,
      targetPersona: '',
    })
    // Scheduling happens after all pieces are collected
  }

  // ── Schedule: by month, clusters first per pillar, pillar last, 3 per week ──
  const POSTS_PER_WEEK = 3
  const publishDays = ['Mon', 'Wed', 'Fri']

  // Sort by month, then within each month: clusters first, pillar last
  const ordered: ContentMapPiece[] = []
  for (const month of [1, 2, 3]) {
    const monthPieces = allPieces.filter((p) => p.publishMonth === month)
    for (const pillarName of [...new Set(monthPieces.map((p) => p.pillarName))]) {
      const clusters = monthPieces.filter((p) => p.pillarName === pillarName && p.contentType === 'cluster')
      const pillar = monthPieces.find((p) => p.pillarName === pillarName && p.contentType === 'pillar')
      ordered.push(...clusters)
      if (pillar) ordered.push(pillar)
    }
  }
  // Add any without month assignment
  const assignedIds = new Set(ordered.map((p) => p.id))
  allPieces.filter((p) => !assignedIds.has(p.id)).forEach((p) => ordered.push(p))

  // Assign weeks and days: 3 per week, week counter resets per month
  let weekOffset = 0
  let currentMonth = 1
  let monthPieceIdx = 0
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].publishMonth !== currentMonth) {
      weekOffset += Math.ceil(monthPieceIdx / POSTS_PER_WEEK)
      currentMonth = ordered[i].publishMonth
      monthPieceIdx = 0
    }
    const weekInMonth = Math.floor(monthPieceIdx / POSTS_PER_WEEK)
    ordered[i].publishWeek = weekOffset + weekInMonth + 1
    ordered[i].publishDay = publishDays[monthPieceIdx % POSTS_PER_WEEK]
    monthPieceIdx++
  }

  const monthCounts = [1, 2, 3].map((m) => ordered.filter((p) => p.publishMonth === m).length)
  const stats = {
    total: ordered.length,
    create: ordered.filter((p) => p.status === 'to_create').length,
    optimize: ordered.filter((p) => p.status === 'to_optimize').length,
    exists: ordered.filter((p) => p.status === 'exists').length,
    problem: ordered.filter((p) => p.contentCategory === 'problem').length,
    product: ordered.filter((p) => p.contentCategory === 'product').length,
    purchase: ordered.filter((p) => p.contentCategory === 'purchase').length,
  }
  console.log(`[ContentStrategist] ${stats.total} pieces (M1:${monthCounts[0]} M2:${monthCounts[1]} M3:${monthCounts[2]}) | new:${stats.create} optimize:${stats.optimize} exists:${stats.exists} | product:${stats.product} problem:${stats.problem} purchase:${stats.purchase}`)

  return ordered
}
