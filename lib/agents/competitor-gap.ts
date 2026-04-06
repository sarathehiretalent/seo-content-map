import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import { getSerpAnalysis } from '@/lib/services/dataforseo'

export interface CompetitorKeywordGap {
  keyword: string
  volume: number | null
  weAppear: boolean
  ourPosition: number | null
  competitors: Array<{ domain: string; position: number }>
}

/**
 * Competitor Gap via SERP Analysis
 *
 * Instead of fetching competitor keyword lists (which are too broad),
 * we search for industry-specific keywords directly in Google and check:
 * - Do WE appear in the results?
 * - Who else appears? (real SERP competitors for our niche)
 *
 * This finds the ACTUAL competitive landscape for our specific industry.
 */
export async function runCompetitorGap(brandId: string): Promise<CompetitorKeywordGap[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Step 1: Claude generates industry keywords we SHOULD rank for
  console.log(`[CompetitorGap] Generating industry keywords...`)
  const kwResult = await callClaude<{ keywords: string[] }>({
    system: 'You generate search keywords for a specific industry niche. JSON only.',
    prompt: `For a company that sells: ${brand.coreProducts ?? 'pre-employment integrity testing'}
Target audience: ${brand.targetAudience ?? 'HR managers'}

Generate 20-25 keywords that a potential BUYER would search for when looking for this type of product/service.
Include:
- Product-focused: "integrity test for hiring", "pre employment honesty test", "employee integrity assessment"
- Problem-focused: "how to reduce employee theft", "pre employment screening tools", "reduce workplace fraud"
- Comparison: "integrity test vs background check", "best integrity testing companies"
- Commercial intent: "integrity test pricing", "buy integrity assessment", "integrity test provider"

Return: { "keywords": ["keyword1", "keyword2", ...] }`,
    maxTokens: 1024,
  })

  const industryKeywords = kwResult.keywords ?? []
  console.log(`[CompetitorGap] Generated ${industryKeywords.length} industry keywords`)

  // Get our existing keywords to check overlap
  const ourKeywords = await prisma.keyword.findMany({ where: { brandId }, select: { query: true, position: true } })
  const ourKeywordMap = new Map(ourKeywords.map((k) => [k.query.toLowerCase(), k.position]))

  // Step 2: Search each keyword in Google SERP
  console.log(`[CompetitorGap] Searching SERPs for industry keywords...`)
  const serpResults = await getSerpAnalysis(industryKeywords)

  const gaps: CompetitorKeywordGap[] = []

  for (const serp of serpResults) {
    if (serp.items.length === 0) continue

    const organics = serp.items.filter((i) => i.type === 'organic')

    // Check if we appear
    const ourResult = organics.find((i) => i.url?.includes(brand.domain))
    const weAppear = !!ourResult
    const ourPosition = ourResult?.position ?? ourKeywordMap.get(serp.keyword.toLowerCase()) ?? null

    // Get competitors (everyone else in top 10, excluding generic)
    const genericDomains = new Set([
      'wikipedia.org', 'en.wikipedia.org', 'youtube.com', 'linkedin.com',
      'indeed.com', 'glassdoor.com', 'reddit.com', 'quora.com',
    ])
    const competitors = organics
      .filter((i) => i.url && !i.url.includes(brand.domain))
      .slice(0, 10)
      .map((i) => {
        let domain = ''
        try { domain = new URL(i.url!).hostname.replace('www.', '') } catch { domain = i.url ?? '' }
        return { domain, position: i.position ?? 0 }
      })
      .filter((c) => !genericDomains.has(c.domain) && !genericDomains.has('www.' + c.domain))

    gaps.push({
      keyword: serp.keyword,
      volume: null, // We could enrich later
      weAppear,
      ourPosition,
      competitors: competitors.slice(0, 5),
    })
  }

  // Sort: keywords where we DON'T appear first, then by number of competitors
  gaps.sort((a, b) => {
    if (a.weAppear !== b.weAppear) return a.weAppear ? 1 : -1
    return b.competitors.length - a.competitors.length
  })

  const notAppearing = gaps.filter((g) => !g.weAppear).length
  const appearing = gaps.filter((g) => g.weAppear).length
  console.log(`[CompetitorGap] Results: ${notAppearing} gaps (we don't appear), ${appearing} where we appear`)

  return gaps
}
