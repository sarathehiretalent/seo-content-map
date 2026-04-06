import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapContext } from './types'

interface PageOptResult {
  recommendations: Array<{
    pageUrl: string
    pageTitle: string | null
    primaryKeyword: string
    relatedKeywords: string[]
    currentPosition: number
    currentClicks: number
    currentImpressions: number
    currentCtr: number
    potentialPosition: number
    potentialTrafficGain: number
    issueType: string
    diagnosis: string
    recommendations: string[]
    reasoning: string
    difficulty: string
    impact: string
    isQuickWin: boolean
  }>
}

export async function runPageOptimizer(ctx: ContentMapContext) {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  // Get pages ranking positions 4-30 (optimization opportunities)
  const keywords = await prisma.keyword.findMany({
    where: {
      brandId: ctx.brandId,
      position: { gte: 4, lte: 30 },
      pageUrl: { not: null },
    },
    orderBy: { impressions: 'desc' },
    take: 50,
  })

  if (keywords.length === 0) return 0

  // Group by page
  const pageData: Record<string, typeof keywords> = {}
  for (const kw of keywords) {
    const page = kw.pageUrl!
    if (!pageData[page]) pageData[page] = []
    pageData[page].push(kw)
  }

  // Get SERP data
  const serpSnapshot = await prisma.serpSnapshot.findFirst({
    where: { brandId: ctx.brandId },
    orderBy: { createdAt: 'desc' },
    include: { results: { include: { keyword: true } } },
  })

  const serpMap: Record<string, { hasFeaturedSnippet: boolean; ownsFeaturedSnippet: boolean; hasPaa: boolean }> = {}
  for (const r of serpSnapshot?.results ?? []) {
    if (r.keyword) {
      serpMap[r.keyword.query] = {
        hasFeaturedSnippet: r.hasFeaturedSnippet,
        ownsFeaturedSnippet: r.ownsFeaturedSnippet,
        hasPaa: r.hasPaa,
      }
    }
  }

  const pages = Object.entries(pageData).map(([url, kws]) => ({
    url,
    keywords: kws.map((k) => ({
      query: k.query,
      position: k.position,
      clicks: k.clicks,
      impressions: k.impressions,
      ctr: k.ctr,
      volume: k.searchVolume,
      kd: k.kd,
      serp: serpMap[k.query] ?? null,
    })),
  }))

  const result = await callClaude<PageOptResult>({
    system: `You are an expert SEO consultant analyzing pages for optimization opportunities.

Brand: ${brand.name} (${brand.domain})
Vertical: ${brand.vertical ?? 'Not specified'}

For each page, analyze:
1. Why it's not ranking higher (issue type)
2. Specific, actionable recommendations
3. Expected impact and difficulty
4. Whether it's a quick win (easy + high impact)

Issue types: thin_content, missing_intent, poor_structure, missing_serp_feature, cannibalization, outdated, low_ctr

Respond with valid JSON only.`,
    prompt: `Analyze these pages and provide optimization recommendations:

${JSON.stringify(pages, null, 2)}

Return JSON:
{
  "recommendations": [
    {
      "pageUrl": "url",
      "pageTitle": "estimated title or null",
      "primaryKeyword": "main keyword",
      "relatedKeywords": ["other keywords"],
      "currentPosition": 7.5,
      "currentClicks": 100,
      "currentImpressions": 5000,
      "currentCtr": 0.02,
      "potentialPosition": 3,
      "potentialTrafficGain": 250,
      "issueType": "low_ctr",
      "diagnosis": "What's wrong with this page",
      "recommendations": ["Specific action 1", "Specific action 2"],
      "reasoning": "Why improving this page matters",
      "difficulty": "easy|medium|hard",
      "impact": "low|medium|high",
      "isQuickWin": true
    }
  ]
}`,
    maxTokens: 8192,
  })

  // Store results
  for (const rec of result.recommendations) {
    await prisma.pageOptimization.create({
      data: {
        contentMapId: ctx.contentMapId,
        pageUrl: rec.pageUrl,
        pageTitle: rec.pageTitle,
        primaryKeyword: rec.primaryKeyword,
        relatedKeywords: JSON.stringify(rec.relatedKeywords),
        currentPosition: rec.currentPosition,
        currentClicks: rec.currentClicks,
        currentImpressions: rec.currentImpressions,
        currentCtr: rec.currentCtr,
        potentialPosition: rec.potentialPosition,
        potentialTrafficGain: rec.potentialTrafficGain,
        issueType: rec.issueType,
        diagnosis: rec.diagnosis,
        recommendations: JSON.stringify(rec.recommendations),
        reasoning: rec.reasoning,
        difficulty: rec.difficulty,
        impact: rec.impact,
        isQuickWin: rec.isQuickWin,
        priority: rec.isQuickWin ? 'critical' : rec.impact === 'high' ? 'high' : 'medium',
      },
    })
  }

  return result.recommendations.length
}
