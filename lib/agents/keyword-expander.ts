import { prisma } from '@/lib/prisma'
import { fetchRankings } from '@/lib/services/gsc'
import { getKeywordMetrics } from '@/lib/services/dataforseo'
import type { DiagnosticContext } from './types'

/**
 * Diagnostic Keyword Pipeline:
 *
 * 1. GSC = ONLY source of keywords (what's actually performing NOW)
 * 2. DataForSEO = ONLY enriches GSC keywords with Volume, KD, CPC
 *    → Does NOT add new keywords
 *
 * This ensures the diagnostic shows real current state, not noise.
 */
export async function runKeywordExpander(ctx: DiagnosticContext) {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  if (!brand.gscProperty) {
    console.log(`[KeywordExpander] No GSC connected — cannot fetch real performance data`)
    return { gscCount: 0, enrichedCount: 0 }
  }

  console.log(`[KeywordExpander] Fetching real performance from GSC: ${brand.gscProperty}`)

  // ── Step 1: GSC — the actual keywords performing right now ──
  let gscCount = 0
  try {
    const rankings = await fetchRankings(brand.gscProperty, { rowLimit: 1000 })
    console.log(`[KeywordExpander] GSC returned: ${rankings.length} keywords`)

    for (const row of rankings) {
      if (!row.page || row.query.length > 80) continue

      await prisma.keyword.upsert({
        where: { brandId_query: { brandId: ctx.brandId, query: row.query } },
        update: {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          pageUrl: row.page,
        },
        create: {
          brandId: ctx.brandId,
          query: row.query,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          pageUrl: row.page,
          source: 'gsc',
        },
      })
    }
    gscCount = rankings.filter((r) => r.page && r.query.length <= 80).length
    console.log(`[KeywordExpander] GSC saved: ${gscCount} keywords`)
  } catch (err) {
    console.error(`[KeywordExpander] GSC failed:`, err instanceof Error ? err.message : err)
    return { gscCount: 0, enrichedCount: 0 }
  }

  // ── Step 2: DataForSEO enriches GSC keywords with Volume, KD, CPC ──
  // Only enriches — does NOT add new keywords
  let enrichedCount = 0
  const keywords = await prisma.keyword.findMany({
    where: { brandId: ctx.brandId },
    orderBy: { impressions: 'desc' },
  })

  if (keywords.length > 0) {
    console.log(`[KeywordExpander] Enriching ${keywords.length} GSC keywords with DataForSEO metrics...`)
    try {
      // Process in batches of 100
      for (let i = 0; i < keywords.length; i += 100) {
        const batch = keywords.slice(i, i + 100)
        const queries = batch.map((k) => k.query)
        const metrics = await getKeywordMetrics(queries)

        for (const m of metrics) {
          if (!m.keyword) continue
          await prisma.keyword.updateMany({
            where: { brandId: ctx.brandId, query: m.keyword },
            data: {
              searchVolume: m.searchVolume,
              kd: m.kd,
              cpc: m.cpc,
              competition: m.competition,
              competitionLevel: m.competitionLevel,
            },
          })
          enrichedCount++
        }

        // Rate limit
        if (i + 100 < keywords.length) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
      console.log(`[KeywordExpander] Enriched ${enrichedCount} keywords with volume/KD/CPC`)
    } catch (err) {
      console.error(`[KeywordExpander] DataForSEO enrichment failed:`, err instanceof Error ? err.message : err)
    }
  }

  // ── Step 3: Cleanup ──
  const deleted = await prisma.keyword.deleteMany({
    where: { brandId: ctx.brandId, pageUrl: null },
  })
  if (deleted.count > 0) console.log(`[KeywordExpander] Removed ${deleted.count} without URL`)

  const finalCount = await prisma.keyword.count({ where: { brandId: ctx.brandId } })
  const withVol = await prisma.keyword.count({ where: { brandId: ctx.brandId, searchVolume: { not: null } } })
  console.log(`[KeywordExpander] Done. Total: ${finalCount}, With Volume: ${withVol}`)

  return { gscCount, enrichedCount }
}
