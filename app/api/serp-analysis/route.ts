import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSerpAnalysis } from '@/lib/services/dataforseo'
import { runCompetitorGap } from '@/lib/agents/competitor-gap'
import { classifyKeywordsByIcp } from '@/lib/agents/icp-alignment'
import { callClaude } from '@/lib/services/anthropic'

export async function POST(request: NextRequest) {
  const { brandId } = await request.json()
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Check diagnostic exists
  const kwCount = await prisma.keyword.count({ where: { brandId } })
  if (kwCount === 0) {
    return NextResponse.json({ error: 'Run diagnostic first to get keyword data' }, { status: 400 })
  }

  const analysis = await prisma.serpAnalysis.create({
    data: { brandId, status: 'pending' },
  })

  // Run in background
  runSerpAnalysisPipeline(brandId, analysis.id).catch((err) => {
    console.error('[SerpAnalysis] Pipeline failed:', err)
  })

  return NextResponse.json({ analysisId: analysis.id })
}

async function runSerpAnalysisPipeline(brandId: string, analysisId: string) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const log: Array<{ step: string; status: string; startedAt?: string; completedAt?: string; resultCount?: number; error?: string }> = [
    { step: 'Analyzing SERP features (top 20)', status: 'pending' },
    { step: 'Fetching competitor keywords', status: 'pending' },
    { step: 'ICP alignment check', status: 'pending' },
    { step: 'Generating opportunities', status: 'pending' },
  ]

  async function update(status: string, extra?: Record<string, string | null>) {
    await prisma.serpAnalysis.update({
      where: { id: analysisId },
      data: { status, pipelineLog: JSON.stringify(log), ...extra },
    })
  }

  try {
    // ═══ Step 1: SERP features for top 20 keywords ═══
    log[0].status = 'running'
    log[0].startedAt = new Date().toISOString()
    await update('running')

    const topKeywords = await prisma.keyword.findMany({
      where: { brandId, impressions: { gt: 0 } },
      orderBy: { impressions: 'desc' },
      take: 20,
    })

    console.log(`[SerpAnalysis] Step 1: SERP for top ${topKeywords.length} keywords`)

    const serpResults = await getSerpAnalysis(topKeywords.map((k) => k.query))

    // Parse brand direct competitors for matching
    const brandCompetitorDomains = new Set<string>()
    ;(brand.competitors ?? '').split('\n').forEach((line) => {
      const m = line.match(/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
      if (m) {
        brandCompetitorDomains.add(m[1].replace('www.', ''))
        brandCompetitorDomains.add('www.' + m[1].replace('www.', ''))
      }
    })

    // Generic domains to deprioritize
    const genericDomains = new Set([
      'wikipedia.org', 'en.wikipedia.org', 'youtube.com', 'www.youtube.com',
      'linkedin.com', 'www.linkedin.com', 'indeed.com', 'www.indeed.com',
      'glassdoor.com', 'www.glassdoor.com', 'reddit.com', 'www.reddit.com',
      'quora.com', 'facebook.com', 'twitter.com', 'amazon.com',
      'forbes.com', 'www.forbes.com',
    ])

    const serpPerformance = serpResults.map((serp) => {
      const kw = topKeywords.find((k) => k.query === serp.keyword)
      const featuredSnippet = serp.items.find((i) => i.type === 'featured_snippet')
      const paaItems = serp.items.filter((i) => i.type === 'people_also_ask')
      const aiOverview = serp.items.find((i) => i.type === 'ai_overview')
      const organics = serp.items.filter((i) => i.type === 'organic')

      const ownsFeatured = featuredSnippet?.url?.includes(brand.domain) ?? false
      const snippetOwner = featuredSnippet?.url
        ? (() => { try { return new URL(featuredSnippet.url).hostname } catch { return featuredSnippet.url } })()
        : null
      const paaQuestions = paaItems.flatMap((i) => i.items ?? []).map((q) => q.question ?? q.title).filter(Boolean)

      // Build full SERP ranking — show ALL top 10 results including us
      const serpRanking = organics.slice(0, 10).map((i) => {
        let domain = ''
        try { domain = new URL(i.url!).hostname } catch { domain = i.url ?? '' }
        const cleanDomain = domain.replace('www.', '')
        const isUs = i.url?.includes(brand.domain) ?? false
        return {
          domain,
          position: i.position ?? 0,
          title: (i.title ?? '').substring(0, 60),
          isUs,
          isDirect: !isUs && (brandCompetitorDomains.has(domain) || brandCompetitorDomains.has(cleanDomain)),
          isGeneric: genericDomains.has(domain) || genericDomains.has(cleanDomain),
        }
      })

      const topCompetitors = serpRanking

      return {
        keyword: serp.keyword,
        ourPosition: kw?.position ? Math.round(kw.position) : null,
        ourUrl: kw?.pageUrl?.replace(/^https?:\/\/[^/]+/, '') ?? null,
        impressions: kw?.impressions ?? 0,
        clicks: kw?.clicks ?? 0,
        features: {
          featuredSnippet: !!featuredSnippet,
          ownsFeaturedSnippet: ownsFeatured,
          snippetOwner,
          paa: paaItems.length > 0,
          paaQuestions,
          aiOverview: !!aiOverview,
          video: serp.items.some((i) => i.type === 'video'),
          images: serp.items.some((i) => i.type === 'images'),
        },
        topCompetitors,
      }
    })

    log[0].status = 'completed'
    log[0].completedAt = new Date().toISOString()
    log[0].resultCount = serpPerformance.length
    await update('running', { serpPerformance: JSON.stringify(serpPerformance) })

    // ═══ Step 2: Competitor keyword gap ═══
    log[1].status = 'running'
    log[1].startedAt = new Date().toISOString()
    await update('running')

    console.log(`[SerpAnalysis] Step 2: Competitor gap analysis`)
    const competitorGaps = await runCompetitorGap(brandId)

    log[1].status = 'completed'
    log[1].completedAt = new Date().toISOString()
    log[1].resultCount = competitorGaps.length
    await update('running', { competitorGap: JSON.stringify(competitorGaps.slice(0, 200)) })

    // ═══ Step 3: ICP alignment of OUR keywords ═══
    log[2].status = 'running'
    log[2].startedAt = new Date().toISOString()
    await update('running')

    console.log(`[SerpAnalysis] Step 3: ICP alignment check`)
    const ourKeywords = await prisma.keyword.findMany({
      where: { brandId, impressions: { gt: 5 } },
      orderBy: { impressions: 'desc' },
      take: 50,
    })

    const icpResults = await classifyKeywordsByIcp(brandId, ourKeywords.map((k) => ({ keyword: k.query, impressions: k.impressions })))

    const aligned = icpResults.filter((r) => r.alignment === 'aligned').length
    const misaligned = icpResults.filter((r) => r.alignment === 'misaligned').length
    const irrelevant = icpResults.filter((r) => r.alignment === 'irrelevant').length

    log[2].status = 'completed'
    log[2].completedAt = new Date().toISOString()
    log[2].resultCount = icpResults.length
    await update('running', { icpAlignment: JSON.stringify({ aligned, misaligned, irrelevant, details: icpResults }) })

    // ═══ Step 4: AI generates prioritized opportunities ═══
    log[3].status = 'running'
    log[3].startedAt = new Date().toISOString()
    await update('running')

    console.log(`[SerpAnalysis] Step 4: Generating opportunities`)

    // Filter: only use ICP-aligned keywords for SERP opportunities
    const alignedKeywords = new Set(icpResults.filter((r) => r.alignment === 'aligned').map((r) => r.keyword.toLowerCase()))
    const icpSerpPerformance = serpPerformance.filter((s) => alignedKeywords.has(s.keyword.toLowerCase()))

    console.log(`[SerpAnalysis] SERP keywords after ICP filter: ${icpSerpPerformance.length} of ${serpPerformance.length}`)

    const opportunities = await callClaude<{
      summary: string
      opportunities: Array<{ type: string; keyword: string; action: string; impact: string; priority: string }>
    }>({
      system: `You are an SEO strategist creating a prioritized opportunity list.
CRITICAL: Only recommend actions for keywords that attract the brand's ICP (Ideal Customer Profile).
Do NOT include keywords that attract students, job seekers, or researchers — only keywords that attract BUYERS of the product.
JSON only.`,
      prompt: `SERP analysis for ${brand.name} (${brand.domain}):
Products: ${brand.coreProducts ?? ''}
Target audience: ${brand.targetAudience ?? ''}

OUR ICP-ALIGNED SERP KEYWORDS (only keywords that attract buyers):
${JSON.stringify(icpSerpPerformance.map((s) => ({
  keyword: s.keyword,
  pos: s.ourPosition,
  impressions: s.impressions,
  snippet: s.features.featuredSnippet ? (s.features.ownsFeaturedSnippet ? 'WE OWN IT' : `Competitor: ${s.features.snippetOwner}`) : 'none',
  paa: s.features.paa,
  paaQuestions: s.features.paaQuestions.slice(0, 3),
  aiOverview: s.features.aiOverview,
})), null, 2)}

KEYWORD GAP (competitors rank, we don't — already ICP-filtered):
${JSON.stringify(competitorGaps.slice(0, 15).map((g) => ({ keyword: g.keyword, volume: g.volume, competitors: g.competitors.map((c) => c.domain + ' #' + c.position).join(', ') })), null, 2)}

ICP SUMMARY: ${aligned} aligned, ${misaligned} misaligned, ${irrelevant} irrelevant

Return JSON:
{
  "summary": "2-3 paragraph executive summary: 1) Current SERP position strengths, 2) Key gaps vs competitors, 3) Top priorities",
  "opportunities": [
    { "type": "snippet_gap|keyword_gap|aiOverview_gap|paa_opportunity", "keyword": "...", "action": "Specific action for this keyword", "impact": "high|medium|low", "priority": "1-10" }
  ]
}

Only list opportunities for ICP-aligned keywords. Max 15 sorted by impact.`,
      maxTokens: 3000,
    })

    log[3].status = 'completed'
    log[3].completedAt = new Date().toISOString()

    await update('completed', {
      opportunities: JSON.stringify(opportunities.opportunities ?? []),
      summary: opportunities.summary ?? null,
    })

    console.log(`[SerpAnalysis] Complete!`)
  } catch (error) {
    console.error(`[SerpAnalysis] FAILED:`, error)
    const failedIdx = log.findIndex((s) => s.status === 'running')
    if (failedIdx >= 0) {
      log[failedIdx].status = 'failed'
      log[failedIdx].error = error instanceof Error ? error.message : String(error)
    }
    await update('failed')
  }
}
