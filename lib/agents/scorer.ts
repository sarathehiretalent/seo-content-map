import { prisma } from '@/lib/prisma'
import type { ContentMapContext } from './types'

export async function runScorer(ctx: ContentMapContext) {
  const pieces = await prisma.contentPiece.findMany({
    where: { contentMapId: ctx.contentMapId },
    include: { keyword: true },
  })

  // Find max volume for normalization
  const maxVolume = Math.max(
    ...pieces.map((p) => p.searchVolume ?? p.keyword?.searchVolume ?? 0),
    1
  )

  for (const piece of pieces) {
    const volume = piece.searchVolume ?? piece.keyword?.searchVolume ?? 0
    const kd = piece.kd ?? piece.keyword?.kd ?? 50
    const ctr = piece.keyword?.ctr ?? 0

    // Parse SERP elements
    const serpElements: string[] = JSON.parse(piece.serpElements || '[]')
    const hasFeaturedSnippet = serpElements.includes('featured_snippet')
    const hasPaa = serpElements.includes('paa')
    const hasAiOverview = serpElements.includes('ai_overview')

    // Intent value
    const intentValues: Record<string, number> = {
      transactional: 1.0,
      commercial: 0.8,
      informational: 0.5,
      navigational: 0.2,
    }
    const intentValue = intentValues[piece.intent] ?? 0.5

    // SERP opportunity
    const serpOpportunity = hasFeaturedSnippet ? 1.0 : hasPaa ? 0.7 : hasAiOverview ? 0.5 : 0.3

    // AOE potential
    const aoeFormats = ['faq', 'how_to', 'definition', 'list']
    const contentTypeIsAoeFriendly = ['hub', 'pillar'].includes(piece.contentType)
    const aoePotential = contentTypeIsAoeFriendly ? 0.8 : 0.4

    // CTR potential
    const ctrPotential = ctr > 0 ? Math.min(ctr * 10, 1) : 0.5

    // Calculate score
    const score =
      (volume / maxVolume) * 0.25 +
      ((100 - kd) / 100) * 0.20 +
      serpOpportunity * 0.20 +
      intentValue * 0.15 +
      ctrPotential * 0.10 +
      aoePotential * 0.10

    const normalizedScore = Math.round(score * 100)

    // Determine priority
    let priority = 'low'
    if (normalizedScore > 80) priority = 'critical'
    else if (normalizedScore > 60) priority = 'high'
    else if (normalizedScore > 40) priority = 'medium'

    await prisma.contentPiece.update({
      where: { id: piece.id },
      data: {
        opportunityScore: normalizedScore,
        priority,
      },
    })
  }

  return pieces.length
}
