import { prisma } from '@/lib/prisma'
import { getSerpAnalysis } from '@/lib/services/dataforseo'
import type { DiagnosticContext } from './types'

/**
 * SERP Analyzer — analyzes top keywords by impressions.
 * Only calls DataForSEO SERP for the top 20 most important keywords.
 * Gets: SERP features, PAA questions, competitors, featured snippet ownership.
 */
export async function runSerpAnalyzer(ctx: DiagnosticContext): Promise<number> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  // Top keywords by impressions (most visible) — only real searchable queries
  const keywords = await prisma.keyword.findMany({
    where: { brandId: ctx.brandId, pageUrl: { not: null }, impressions: { gt: 0 } },
    orderBy: { impressions: 'desc' },
    take: 20,
  })

  if (keywords.length === 0) {
    console.log(`[SerpAnalyzer] No keywords with impressions to analyze`)
    return 0
  }

  console.log(`[SerpAnalyzer] Analyzing top ${keywords.length} keywords by impressions`)

  const snapshot = await prisma.serpSnapshot.create({
    data: { brandId: ctx.brandId, name: `SERP Analysis - ${new Date().toLocaleDateString()}` },
  })

  const queries = keywords.map((k) => k.query)
  const serpResults = await getSerpAnalysis(queries)

  let count = 0
  for (const serp of serpResults) {
    const keyword = keywords.find((k) => k.query === serp.keyword)
    if (!keyword || serp.items.length === 0) continue

    const featuredSnippet = serp.items.find((i) => i.type === 'featured_snippet')
    const paaItems = serp.items.filter((i) => i.type === 'people_also_ask')
    const organicItems = serp.items.filter((i) => i.type === 'organic')
    const aiOverview = serp.items.find((i) => i.type === 'ai_overview')

    const ownsFeatured = featuredSnippet?.url?.includes(brand.domain) ?? false
    const paaQuestions = paaItems.flatMap((i) => i.items ?? []).map((q) => q.question ?? q.title).filter(Boolean)

    const topCompetitors = organicItems
      .filter((item) => item.url && !item.url.includes(brand.domain))
      .slice(0, 10)
      .map((item) => {
        try { return { domain: new URL(item.url!).hostname, position: item.position ?? 0, title: item.title } }
        catch { return { domain: item.url ?? '', position: item.position ?? 0, title: item.title } }
      })

    const allFeatures = [...new Set(serp.items.map((i) => i.type))]

    // Also update the keyword's serpFeatures field
    await prisma.keyword.update({
      where: { id: keyword.id },
      data: { serpFeatures: JSON.stringify(allFeatures) },
    })

    await prisma.serpResult.create({
      data: {
        snapshotId: snapshot.id,
        keywordId: keyword.id,
        hasFeaturedSnippet: !!featuredSnippet,
        ownsFeaturedSnippet: ownsFeatured,
        hasPaa: paaItems.length > 0,
        paaQuestions: JSON.stringify(paaQuestions),
        hasKnowledgePanel: !!serp.items.find((i) => i.type === 'knowledge_graph'),
        hasVideoResults: serp.items.some((i) => i.type === 'video'),
        hasLocalPack: !!serp.items.find((i) => i.type === 'local_pack'),
        hasImagePack: !!serp.items.find((i) => i.type === 'images'),
        hasSitelinks: !!serp.items.find((i) => i.type === 'sitelinks'),
        hasAiOverview: !!aiOverview,
        topCompetitors: JSON.stringify(topCompetitors),
        serpFeaturesList: JSON.stringify(allFeatures),
      },
    })
    count++
  }

  console.log(`[SerpAnalyzer] Saved ${count} SERP results`)
  return count
}
