import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'

/**
 * Topic Discovery Agent
 * Generates content TOPICS (not keywords) based on:
 * - Brand Intelligence (products, ICP, audience)
 * - Buyer journey stages (TOFU/MOFU/BOFU)
 * - Existing content gaps
 * - What the ICP needs to know before buying
 */

export interface DiscoveredTopic {
  topic: string
  funnelStage: 'tofu' | 'mofu' | 'bofu'
  contentType: 'pillar' | 'cluster' | 'sub-cluster'
  rationale: string
  suggestedKeywords: string[] // Suggestions to validate with DataForSEO
  targetPersona: string
}

export async function runTopicDiscovery(brandId: string): Promise<DiscoveredTopic[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Get existing content structure
  const diagnostic = await prisma.diagnostic.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { currentStructure: true, gaps: true },
  })

  // Get existing keywords to avoid duplicating
  const existingKeywords = await prisma.keyword.findMany({
    where: { brandId },
    select: { query: true },
    take: 200,
  })

  // Get competitor gaps if available
  const serpAnalysis = await prisma.serpAnalysis.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { competitorGap: true },
  })

  const gaps = diagnostic?.gaps ? JSON.parse(diagnostic.gaps) : []
  const competitorGaps = serpAnalysis?.competitorGap ? JSON.parse(serpAnalysis.competitorGap) : []
  const existingKwList = existingKeywords.map((k) => k.query).slice(0, 50)

  console.log(`[TopicDiscovery] Brand: ${brand.name}, Gaps: ${gaps.length}, Competitor gaps: ${competitorGaps.length}`)

  const result = await callClaude<{ topics: DiscoveredTopic[] }>({
    system: `You are a senior SEO content strategist creating a topical authority map for a company that sells ${brand.coreProducts?.substring(0, 100) ?? 'pre-employment integrity assessment tests'}.

TARGET AUDIENCE: ${brand.targetAudience ?? 'CEOs, business leaders, HR directors'}

CONTENT STRATEGY:
The content must attract decision-makers who have PROBLEMS that the product solves. Not all content should mention the product directly.

PILLAR TOPICS: Use broad terms with HIGH search volume. Examples:
- "employee theft prevention" (broad problem the product solves)
- "pre employment testing" (broad category)
- "hiring risk management" (business problem)
These become 3000-5000 word comprehensive guides.

CLUSTER TOPICS: More specific, connected to a pillar. Mix of:
- PRODUCT-RELATED: "integrity test for hiring", "pre employment integrity assessment" (directly about the product)
- PROBLEM-RELATED: "cost of employee theft by industry", "how to reduce turnover in retail" (business problems)
- COMPARISON: "integrity test vs background check", "best pre employment screening tools"
- EDUCATIONAL: "what is an integrity test", "types of pre employment assessments"

RULES:
- KEYWORD FIRST — every topic starts with a keyword people ACTUALLY search for
- Pillars must be broad enough to have volume (think head terms, not long-tail)
- ~30% of topics should be about the PROBLEM (not the product) to attract wider audience
- ~50% about the SOLUTION (the product category, how it works, comparisons)
- ~20% about BUYING (ROI, pricing, implementation, case studies)
- Vary personas: CEO, Business Owner, VP Operations, HR Director, CFO, Risk Manager
- 25-35 topics total
- NOT for students, job seekers, test-takers

JSON only.`,
    prompt: `Create a topical content map for:

BRAND: ${brand.name} (${brand.domain})
PRODUCTS: ${brand.coreProducts ?? ''}
TARGET AUDIENCE: ${brand.targetAudience ?? ''}
NOT THIS BRAND: ${brand.notBrand ?? ''}

HIGH-VOLUME KEYWORDS IN OUR SPACE (use these as pillar/cluster seeds — they have REAL search volume):
${existingKeywords.slice(0, 15).map((k) => `"${k.query}" (already ranking)`).join(', ')}

EXISTING CONTENT GAPS (from analysis):
${JSON.stringify(gaps.slice(0, 5), null, 2)}

COMPETITOR GAPS (keywords competitors rank for, we don't — already ICP filtered):
${JSON.stringify(competitorGaps.slice(0, 15).map((g: any) => g.keyword), null, 2)}

KEYWORDS WE ALREADY RANK FOR (don't duplicate):
${existingKwList.join(', ')}

Return JSON:
{
  "topics": [
    {
      "topic": "Topic based on a KEYWORD a decision-maker would search",
      "funnelStage": "tofu|mofu|bofu",
      "contentType": "pillar|cluster|sub-cluster",
      "rationale": "Why this drives leads — what business problem it addresses",
      "suggestedKeywords": ["short keyword people search (2-4 words)", "variation 1", "variation 2"],
      "targetPersona": "CEO|Business Owner|VP Operations|HR Director|Risk Manager|CFO"
    }
  ]
}

IMPORTANT:
- suggestedKeywords should be what the PERSONA actually types in Google
- Vary targetPersona — mix of C-suite, operations, HR leadership, not just one role
- 25-35 topics for first month. Quality over quantity.`,
    maxTokens: 5000,
  })

  const topics = result.topics ?? []
  console.log(`[TopicDiscovery] Generated ${topics.length} topics (TOFU: ${topics.filter((t) => t.funnelStage === 'tofu').length}, MOFU: ${topics.filter((t) => t.funnelStage === 'mofu').length}, BOFU: ${topics.filter((t) => t.funnelStage === 'bofu').length})`)

  return topics
}
