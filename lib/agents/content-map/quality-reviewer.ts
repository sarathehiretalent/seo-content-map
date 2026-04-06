import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapPiece } from './content-strategist'

/**
 * Quality Reviewer Agent
 * Reviews the entire content map for:
 * - ICP alignment (every piece targets the right buyer)
 * - No brand confusion (nothing about similar companies)
 * - Balanced funnel distribution
 * - Realistic publishing timeline
 * - No duplicate/cannibalization with existing content
 * - Coherent internal linking
 */

export interface ReviewResult {
  approved: number
  flagged: number
  removed: number
  flags: Array<{ pieceId: string; issue: string; suggestion: string }>
  removedPieces: string[] // IDs to remove
  summary: string
}

export async function runQualityReview(
  brandId: string,
  pieces: ContentMapPiece[]
): Promise<ReviewResult> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  console.log(`[QualityReviewer] Reviewing ${pieces.length} content pieces`)

  const result = await callClaude<ReviewResult>({
    system: `You are a senior SEO quality reviewer. You check a content map for coherence with the brand.

BRAND: ${brand.name}
PRODUCTS: ${brand.coreProducts ?? ''}
NOT THIS BRAND: ${brand.notBrand ?? ''}
TARGET AUDIENCE: ${brand.targetAudience ?? ''}

CHECK FOR:
1. ICP alignment — every piece must attract BUYERS, not students/job seekers/researchers
2. Brand confusion — nothing about similar companies or unrelated products
3. Funnel balance — should be ~40% TOFU, 35% MOFU, 25% BOFU
4. Cannibalization — no two pieces targeting the same keyword
5. Realistic timeline — 3 per week is achievable
6. Internal linking — every cluster links to its pillar, pillars come AFTER clusters
7. Missing links — if a piece has no internal links, flag it

Flag issues but don't be overly strict. The goal is a usable content map.
JSON only.`,
    prompt: `Review this content map:

${JSON.stringify(pieces.map((p) => ({
  id: p.id,
  title: p.title,
  keyword: p.targetKeyword,
  type: p.contentType,
  funnel: p.funnelStage,
  status: p.status,
  pillar: p.pillarName,
  week: p.publishWeek,
  linksTo: p.linksTo?.length ?? 0,
  persona: p.targetPersona,
})), null, 2)}

FUNNEL DISTRIBUTION:
- TOFU: ${pieces.filter((p) => p.funnelStage === 'tofu').length}
- MOFU: ${pieces.filter((p) => p.funnelStage === 'mofu').length}
- BOFU: ${pieces.filter((p) => p.funnelStage === 'bofu').length}

PILLARS: ${[...new Set(pieces.map((p) => p.pillarName))].join(', ')}

Return JSON:
{
  "approved": number of pieces that pass review,
  "flagged": number of pieces with issues,
  "removed": number of pieces that should be removed,
  "flags": [{ "pieceId": "id", "issue": "what's wrong", "suggestion": "how to fix" }],
  "removedPieces": ["id1", "id2"],
  "summary": "2-3 paragraph review: overall quality, strengths, weaknesses, key recommendations"
}`,
    maxTokens: 3000,
  })

  console.log(`[QualityReviewer] Approved: ${result.approved}, Flagged: ${result.flagged}, Removed: ${result.removed}`)
  return result
}
