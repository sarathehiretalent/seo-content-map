import { prisma } from '@/lib/prisma'
import type { DiagnosticContext } from './types'

/**
 * Relevance filter for GSC-based diagnostic.
 * Since all keywords come from GSC (real performance data),
 * we only do programmatic cleanup — no AI needed.
 * GSC keywords are real; the brand IS ranking for them.
 */
export async function runRelevanceFilter(ctx: DiagnosticContext): Promise<number> {
  const totalBefore = await prisma.keyword.count({ where: { brandId: ctx.brandId } })
  console.log(`[RelevanceFilter] Starting with ${totalBefore} keywords`)

  // Only remove obvious garbage: too long queries, exam-style text
  const allKeywords = await prisma.keyword.findMany({ where: { brandId: ctx.brandId } })
  const garbageIds = allKeywords
    .filter((k) =>
      k.query.length > 80 ||
      k.query.includes('select one:') ||
      k.query.includes('true false') ||
      /^\d+\.\s/.test(k.query)
    )
    .map((k) => k.id)

  if (garbageIds.length > 0) {
    await prisma.keyword.deleteMany({ where: { id: { in: garbageIds } } })
    console.log(`[RelevanceFilter] Removed ${garbageIds.length} garbage queries`)
  }

  const totalAfter = await prisma.keyword.count({ where: { brandId: ctx.brandId } })
  console.log(`[RelevanceFilter] Final: ${totalAfter} keywords`)
  return totalBefore - totalAfter
}
