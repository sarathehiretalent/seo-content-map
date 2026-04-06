import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapContext } from './types'

export interface ClusterResult {
  pillars: Array<{
    pillarName: string
    pillarKeyword: string
    clusters: Array<{
      clusterName: string
      clusterKeyword: string
      keywords: string[]
    }>
  }>
}

export async function runClustering(ctx: ContentMapContext): Promise<ClusterResult> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  const diagnostic = await prisma.diagnostic.findUniqueOrThrow({
    where: { id: ctx.diagnosticId },
  })

  const keywords = await prisma.keyword.findMany({
    where: { brandId: ctx.brandId },
    orderBy: { impressions: 'desc' },
    take: 500,
  })

  const keywordData = keywords.map((k) => ({
    query: k.query,
    volume: k.searchVolume,
    kd: k.kd,
    cpc: k.cpc,
    intent: k.intent,
    position: k.position,
    impressions: k.impressions,
  }))

  const result = await callClaude<ClusterResult>({
    system: `You are an expert SEO strategist specializing in topical authority and pillar/cluster content strategy.
Create a new content structure that COMPLEMENTS what already exists (don't duplicate).

Brand: ${brand.name}
Domain: ${brand.domain}
Vertical: ${brand.vertical ?? 'Not specified'}
Description: ${brand.description ?? 'Not specified'}
Month: ${ctx.month}/${ctx.year}

Current structure detected:
${diagnostic.currentStructure ?? 'None detected'}

Content gaps identified:
${diagnostic.gaps ?? '[]'}

Respond with valid JSON only.`,
    prompt: `Based on these keywords and the existing structure, create a pillar/cluster content map:

Keywords with metrics:
${JSON.stringify(keywordData, null, 2)}

Rules:
- Create 3-7 pillars based on the main topic areas
- Each pillar should have 3-8 clusters
- Assign each keyword to exactly one cluster
- Prioritize filling identified gaps
- Don't create content that duplicates existing pages
- Consider search intent when grouping

Return JSON:
{
  "pillars": [
    {
      "pillarName": "Descriptive name for the pillar page",
      "pillarKeyword": "main target keyword",
      "clusters": [
        {
          "clusterName": "Cluster topic name",
          "clusterKeyword": "cluster target keyword",
          "keywords": ["keyword1", "keyword2"]
        }
      ]
    }
  ]
}`,
    maxTokens: 8192,
  })

  return result
}
