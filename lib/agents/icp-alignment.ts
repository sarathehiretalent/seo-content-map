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

For each keyword, determine:
- "aligned": A person searching this is likely part of the ICP — they could become a customer
- "misaligned": Related to the brand's industry but the searcher is NOT the ICP (e.g., students, job seekers, researchers — not buyers)
- "irrelevant": Not related to the brand's business at all

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
- Pre-employment integrity tests/assessments specifically
- Honesty testing for hiring
- Employee integrity screening
- Workplace theft/risk prevention through testing
- Topics an HR manager would search when looking for integrity testing solutions

REMOVE keywords about:
- Personality tests (DISC, Myers-Briggs, Big Five) — different product
- Typing tests, skills assessments, aptitude tests — different product
- General HR software, ATS, recruiting tools — different category
- Background checks (unless combined with integrity testing)
- Job seeker queries, academic research
- Any assessment type that is NOT integrity/honesty focused

Be VERY strict. If a keyword is about any type of assessment OTHER than integrity/honesty, remove it.

Return ONLY the keyword strings that pass. JSON only.`,
      prompt: `Filter — keep ONLY integrity/honesty testing related keywords:

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
