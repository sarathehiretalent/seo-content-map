import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapContext } from './types'
import type { ClusterResult } from './clustering'

export interface ContentIdea {
  pillarName: string
  pillarKeyword: string
  clusterName: string
  clusterKeyword: string
  title: string
  description: string
  contentType: string
  category: string
  intent: string
  reasoning: string
  paaQuestions: string[]
  serpElements: string[]
}

export async function runContentIdeator(
  ctx: ContentMapContext,
  clusters: ClusterResult
): Promise<ContentIdea[]> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  const diagnostic = await prisma.diagnostic.findUniqueOrThrow({
    where: { id: ctx.diagnosticId },
  })

  // Get SERP data for context
  const serpSnapshot = await prisma.serpSnapshot.findFirst({
    where: { brandId: ctx.brandId },
    orderBy: { createdAt: 'desc' },
    include: {
      results: {
        include: { keyword: true },
        take: 100,
      },
    },
  })

  const serpContext = (serpSnapshot?.results ?? []).map((r) => ({
    keyword: r.keyword?.query,
    hasFeaturedSnippet: r.hasFeaturedSnippet,
    ownsFeaturedSnippet: r.ownsFeaturedSnippet,
    hasPaa: r.hasPaa,
    paaQuestions: JSON.parse(r.paaQuestions),
    hasAiOverview: r.hasAiOverview,
  }))

  const allIdeas: ContentIdea[] = []

  // Process pillars in batches to stay within token limits
  for (const pillar of clusters.pillars) {
    const result = await callClaude<{ ideas: ContentIdea[] }>({
      system: `You are an expert SEO content strategist. Generate content ideas for a pillar/cluster strategy.

Brand: ${brand.name} (${brand.domain})
Vertical: ${brand.vertical ?? 'Not specified'}
Description: ${brand.description ?? 'Not specified'}
Current structure: ${diagnostic.currentStructure ?? 'None'}

SERP context:
${JSON.stringify(serpContext.slice(0, 20), null, 2)}

For each cluster, generate ONE content piece with:
- A compelling title optimized for the target keyword
- A 2-3 sentence description of what the content should cover
- Content type: hub, spoke, pillar, cluster, or supporting
- Category topic
- Search intent classification
- Reasoning: WHY this content should be created (reference existing gaps, SERP opportunities)
- PAA questions to answer within the content
- SERP elements to target (featured_snippet, paa, ai_overview, video, etc.)

Also generate ONE piece for the pillar page itself.
Respond with valid JSON only.`,
      prompt: `Generate content ideas for this pillar and its clusters:

Pillar: ${pillar.pillarName} (keyword: ${pillar.pillarKeyword})
Clusters:
${JSON.stringify(pillar.clusters, null, 2)}

Return JSON:
{
  "ideas": [
    {
      "pillarName": "${pillar.pillarName}",
      "pillarKeyword": "${pillar.pillarKeyword}",
      "clusterName": "cluster or pillar name",
      "clusterKeyword": "target keyword",
      "title": "Content title",
      "description": "2-3 sentence description",
      "contentType": "pillar|cluster|hub|spoke|supporting",
      "category": "topic category",
      "intent": "informational|transactional|commercial|navigational",
      "reasoning": "Why create this content, what opportunity it captures",
      "paaQuestions": ["question 1", "question 2"],
      "serpElements": ["featured_snippet", "paa", "ai_overview"]
    }
  ]
}`,
      maxTokens: 4096,
    })

    allIdeas.push(...result.ideas)
  }

  return allIdeas
}
