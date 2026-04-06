import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapContext } from './types'

interface AoeResult {
  summary: string
  items: Array<{
    targetQuery: string
    targetEngine: string
    currentPresence: string
    currentSnippet: string | null
    recommendedContent: string
    contentFormat: string
    optimizationTips: string[]
    estimatedImpact: string
    priority: string
  }>
}

export async function runAoeStrategist(ctx: ContentMapContext) {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  // Get SERP data with AI overview and featured snippet opportunities
  const serpSnapshot = await prisma.serpSnapshot.findFirst({
    where: { brandId: ctx.brandId },
    orderBy: { createdAt: 'desc' },
    include: {
      results: {
        include: { keyword: true },
        where: {
          OR: [
            { hasFeaturedSnippet: true },
            { hasPaa: true },
            { hasAiOverview: true },
          ],
        },
      },
    },
  })

  const keywords = await prisma.keyword.findMany({
    where: { brandId: ctx.brandId, intent: 'informational' },
    orderBy: { impressions: 'desc' },
    take: 50,
  })

  const serpData = (serpSnapshot?.results ?? []).map((r) => ({
    keyword: r.keyword?.query,
    hasFeaturedSnippet: r.hasFeaturedSnippet,
    ownsFeaturedSnippet: r.ownsFeaturedSnippet,
    hasPaa: r.hasPaa,
    paaQuestions: JSON.parse(r.paaQuestions),
    hasAiOverview: r.hasAiOverview,
  }))

  const result = await callClaude<AoeResult>({
    system: `You are an expert in Answer Engine Optimization (AOE/AEO).
Analyze SERP data and create an AOE strategy for AI search engines.

Brand: ${brand.name} (${brand.domain})
Vertical: ${brand.vertical ?? 'Not specified'}

Target engines: google_ai_overview, chatgpt, perplexity, featured_snippet, paa

For each opportunity:
- Identify the target query and engine
- Assess current presence (none, partial, owned)
- Recommend specific content to create/optimize
- Suggest content format (direct_answer, faq, how_to, comparison, definition, list)
- Provide specific optimization tips

Respond with valid JSON only.`,
    prompt: `Create an AOE strategy based on this data:

SERP features data:
${JSON.stringify(serpData, null, 2)}

Top informational keywords:
${JSON.stringify(keywords.map((k) => ({ query: k.query, volume: k.searchVolume, position: k.position })), null, 2)}

Return JSON:
{
  "summary": "2-3 paragraph overview of AOE strategy for this brand",
  "items": [
    {
      "targetQuery": "keyword/question to optimize for",
      "targetEngine": "google_ai_overview|chatgpt|perplexity|featured_snippet|paa",
      "currentPresence": "none|partial|owned",
      "currentSnippet": "current snippet text or null",
      "recommendedContent": "what content to create/optimize",
      "contentFormat": "direct_answer|faq|how_to|comparison|definition|list",
      "optimizationTips": ["tip 1", "tip 2", "tip 3"],
      "estimatedImpact": "low|medium|high",
      "priority": "critical|high|medium|low"
    }
  ]
}`,
    maxTokens: 8192,
  })

  // Store AOE strategy
  const strategy = await prisma.aoeStrategy.create({
    data: {
      brandId: ctx.brandId,
      name: `AOE Strategy - ${ctx.month}/${ctx.year}`,
      month: ctx.month,
      year: ctx.year,
      summary: result.summary,
    },
  })

  for (const item of result.items) {
    await prisma.aoeStrategyItem.create({
      data: {
        strategyId: strategy.id,
        targetQuery: item.targetQuery,
        targetEngine: item.targetEngine,
        currentPresence: item.currentPresence,
        currentSnippet: item.currentSnippet,
        recommendedContent: item.recommendedContent,
        contentFormat: item.contentFormat,
        optimizationTips: JSON.stringify(item.optimizationTips),
        estimatedImpact: item.estimatedImpact,
        priority: item.priority,
      },
    })
  }

  return result.items.length
}
