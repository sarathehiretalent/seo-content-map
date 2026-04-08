import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'

/**
 * ICP Alignment Agent — evaluates if keywords attract the right audience.
 * Uses Brand Intelligence (targetAudience, coreProducts) to classify.
 *
 * Returns classifications: aligned / misaligned / irrelevant
 * Also filters competitor keywords to only ICP-relevant ones.
 */

export interface IcpResult {
  keyword: string
  alignment: 'aligned' | 'misaligned' | 'irrelevant'
  reason: string
}

export async function classifyKeywordsByIcp(
  brandId: string,
  keywords: Array<{ keyword: string; impressions?: number }>
): Promise<IcpResult[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  const brandContext = [
    `Brand: ${brand.name} (${brand.domain})`,
    brand.coreProducts ? `Products: ${brand.coreProducts}` : '',
    brand.targetAudience ? `Target Audience (ICP): ${brand.targetAudience}` : '',
    brand.notBrand ? `NOT this brand: ${brand.notBrand}` : '',
  ].filter(Boolean).join('\n')

  const allResults: IcpResult[] = []

  // Process in batches
  for (let i = 0; i < keywords.length; i += 100) {
    const batch = keywords.slice(i, i + 100)

    const result = await callClaude<{ classifications: IcpResult[] }>({
      system: `You classify keywords by ICP (Ideal Customer Profile) alignment for a brand.

${brandContext}

CLASSIFICATION RULES:

"aligned" — The searcher has BUYING POWER or INFLUENCE over a purchase decision:
- Branded searches (the brand's own name) — a buyer checking the brand
- "[product] for employers/companies/hiring" — buyer searching for a solution
- "[product] pricing/cost/ROI/comparison/review" — commercial/transactional intent
- "best [product category]", "top [product] companies" — shopping
- "how to reduce [problem]", "prevent [problem]" — decision-maker looking for solutions
- Problems the ICP faces that the product solves — pain-point awareness

"misaligned" — Related to the brand's industry but the searcher is the END USER, not the buyer:
- "[product] meaning/definition" — likely someone TAKING a test, not buying one
- "how to pass [product]", "[product] questions and answers" — test-taker preparing
- "[product] examples/sample" — candidate practicing, not employer purchasing
- Job seekers, students, employees on the receiving end of the product
- Academic or psychological research about the topic

"irrelevant" — Not related to the brand's business at all:
- Completely different product category the brand does NOT sell
- Different industry entirely

KEY PRINCIPLE: Ask "WHO is searching?" — if it's the BUYER (employer, manager, business owner), it's aligned. If it's the END USER (candidate, employee, student, test-taker), it's misaligned. If it's neither, it's irrelevant.

Keep reasons to 1 short sentence.
Respond with valid JSON only.`,
      prompt: `Classify these keywords by ICP alignment:

${JSON.stringify(batch.map(k => k.keyword), null, 2)}

Return JSON:
{
  "classifications": [
    { "keyword": "...", "alignment": "aligned|misaligned|irrelevant", "reason": "Short reason" }
  ]
}`,
      maxTokens: 4096,
    })

    if (result.classifications) {
      allResults.push(...result.classifications)
    }
  }

  return allResults
}

/**
 * Filters competitor keywords to only those relevant to the brand's ICP.
 * Returns only keywords that an ideal customer would search for.
 */
export async function filterCompetitorKeywordsByIcp(
  brandId: string,
  competitorKeywords: Array<{ keyword: string; volume: number | null; position: number | null; competitorDomain: string }>
): Promise<Array<{ keyword: string; volume: number | null; position: number | null; competitorDomain: string }>> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  if (competitorKeywords.length === 0) return []

  const brandContext = [
    `Brand: ${brand.name}`,
    brand.coreProducts ? `Products: ${brand.coreProducts}` : '',
    brand.targetAudience ? `ICP: ${brand.targetAudience}` : '',
    brand.notBrand ? `NOT: ${brand.notBrand}` : '',
  ].filter(Boolean).join('\n')

  const relevant: typeof competitorKeywords = []

  for (let i = 0; i < competitorKeywords.length; i += 150) {
    const batch = competitorKeywords.slice(i, i + 150)

    const result = await callClaude<{ relevant: string[] }>({
      system: `You are a strict keyword relevance filter. You ONLY keep keywords directly related to a brand's specific product.

${brandContext}

KEEP ONLY keywords about:
- The brand's core product/service and closely related terms
- Problems that the brand's target audience faces that the product solves
- Topics the target audience would search when looking for this type of solution
- Comparisons, pricing, or buying guides for this specific product category

REMOVE keywords about:
- Similar-sounding but DIFFERENT products or categories
- Generic industry tools or software not specific to this brand's niche
- Job seeker queries, academic research, student questions
- Products or services the brand explicitly does NOT offer
- Any topic that wouldn't lead a buyer toward this brand's product

Be VERY strict. If a keyword is about a different product category even if it's in the same industry, remove it.

Return ONLY the keyword strings that pass. JSON only.`,
      prompt: `Filter — keep ONLY keywords relevant to this brand's product:

${JSON.stringify(batch.map(k => k.keyword), null, 2)}

Return: { "relevant": ["keyword1", "keyword2", ...] }`,
      maxTokens: 2048,
    })

    if (result.relevant) {
      const relevantSet = new Set(result.relevant.map(r => r.toLowerCase()))
      relevant.push(...batch.filter(k => relevantSet.has(k.keyword.toLowerCase())))
    }
  }

  console.log(`[ICP Filter] Competitor keywords: ${competitorKeywords.length} → ${relevant.length} ICP-relevant`)
  return relevant
}
