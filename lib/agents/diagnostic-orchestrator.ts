import { prisma } from '@/lib/prisma'
import type { DiagnosticContext, PipelineStep } from './types'
import { runKeywordExpander } from './keyword-expander'
import { runRelevanceFilter } from './relevance-filter'

async function updateDiagnostic(
  id: string,
  status: string,
  log: PipelineStep[],
  extra?: Record<string, string | null>
) {
  await prisma.diagnostic.update({
    where: { id },
    data: { status, pipelineLog: JSON.stringify(log), ...extra },
  })
}

/**
 * Diagnostic Pipeline — focused on ranking data only.
 * SERP Analysis and Structure Analysis have their own separate buttons.
 */
export async function runDiagnosticPipeline(ctx: DiagnosticContext) {
  const log: PipelineStep[] = [
    { step: 'Fetching keywords from GSC', status: 'pending' },
    { step: 'Enriching with DataForSEO (Volume, KD, CPC)', status: 'pending' },
  ]

  console.log(`[DiagnosticPipeline] Starting: ${ctx.diagnosticId}`)

  try {
    // Step 1: Fetch keywords from GSC + enrich with DataForSEO
    log[0].status = 'running'
    log[0].startedAt = new Date().toISOString()
    await updateDiagnostic(ctx.diagnosticId, 'fetching', log)

    const { gscCount, enrichedCount } = await runKeywordExpander(ctx)
    log[0].status = 'completed'
    log[0].completedAt = new Date().toISOString()
    log[0].resultCount = gscCount
    await updateDiagnostic(ctx.diagnosticId, 'fetching', log)

    const kwCount = await prisma.keyword.count({ where: { brandId: ctx.brandId } })
    if (kwCount === 0) {
      log[1].status = 'failed'
      log[1].error = 'No keywords found. Check GSC connection.'
      await updateDiagnostic(ctx.diagnosticId, 'failed', log)
      return
    }

    // Step 2: Cleanup garbage queries
    log[1].status = 'running'
    log[1].startedAt = new Date().toISOString()
    await updateDiagnostic(ctx.diagnosticId, 'enriching', log)

    const removed = await runRelevanceFilter(ctx)
    const afterFilter = await prisma.keyword.count({ where: { brandId: ctx.brandId } })
    log[1].status = 'completed'
    log[1].completedAt = new Date().toISOString()
    log[1].resultCount = enrichedCount

    await updateDiagnostic(ctx.diagnosticId, 'completed', log)
    console.log(`[DiagnosticPipeline] Completed! ${afterFilter} keywords, removed ${removed} garbage`)
  } catch (error) {
    console.error(`[DiagnosticPipeline] FAILED:`, error)
    const failedIdx = log.findIndex((s) => s.status === 'running')
    if (failedIdx >= 0) {
      log[failedIdx].status = 'failed'
      log[failedIdx].error = error instanceof Error ? error.message : String(error)
    }
    await updateDiagnostic(ctx.diagnosticId, 'failed', log)
  }
}
