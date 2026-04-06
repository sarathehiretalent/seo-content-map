import { prisma } from '@/lib/prisma'
import type { ContentMapContext, PipelineStep } from './types'
import { runClustering } from './clustering'
import { runContentIdeator } from './content-ideator'
import { runPageOptimizer } from './page-optimizer'
import { runAoeStrategist } from './aoe-strategist'
import { runScorer } from './scorer'

async function updateContentMap(
  id: string,
  status: string,
  log: PipelineStep[]
) {
  await prisma.contentMap.update({
    where: { id },
    data: {
      status,
      pipelineLog: JSON.stringify(log),
    },
  })
}

export async function runContentMapPipeline(ctx: ContentMapContext) {
  const log: PipelineStep[] = [
    { step: 'Clustering keywords', status: 'pending' },
    { step: 'Generating content ideas', status: 'pending' },
    { step: 'Analyzing page optimizations', status: 'pending' },
    { step: 'Creating AOE strategy', status: 'pending' },
    { step: 'Scoring & prioritizing', status: 'pending' },
  ]

  try {
    // Step C1: Cluster Keywords
    log[0].status = 'running'
    log[0].startedAt = new Date().toISOString()
    await updateContentMap(ctx.contentMapId, 'clustering', log)

    const clusters = await runClustering(ctx)
    log[0].status = 'completed'
    log[0].completedAt = new Date().toISOString()
    log[0].resultCount = clusters.pillars.length

    // Step C2: Generate Content Ideas
    log[1].status = 'running'
    log[1].startedAt = new Date().toISOString()
    await updateContentMap(ctx.contentMapId, 'ideating', log)

    const ideas = await runContentIdeator(ctx, clusters)

    // Persist content pieces
    const keywordMap = new Map(
      (await prisma.keyword.findMany({ where: { brandId: ctx.brandId } }))
        .map((k) => [k.query, k])
    )

    let sortOrder = 0
    for (const idea of ideas) {
      const kw = keywordMap.get(idea.clusterKeyword)
      await prisma.contentPiece.create({
        data: {
          contentMapId: ctx.contentMapId,
          keywordId: kw?.id ?? null,
          pillarName: idea.pillarName,
          pillarKeyword: idea.pillarKeyword,
          clusterName: idea.clusterName,
          clusterKeyword: idea.clusterKeyword,
          intent: idea.intent,
          contentType: idea.contentType,
          category: idea.category,
          kd: kw?.kd ?? null,
          competition: kw?.competitionLevel ?? null,
          cpc: kw?.cpc ?? null,
          searchVolume: kw?.searchVolume ?? null,
          title: idea.title,
          description: idea.description,
          reasoning: idea.reasoning,
          paaQuestions: JSON.stringify(idea.paaQuestions),
          serpElements: JSON.stringify(idea.serpElements),
          sortOrder: sortOrder++,
        },
      })
    }

    log[1].status = 'completed'
    log[1].completedAt = new Date().toISOString()
    log[1].resultCount = ideas.length

    // Step C3: Page Optimizations
    log[2].status = 'running'
    log[2].startedAt = new Date().toISOString()
    await updateContentMap(ctx.contentMapId, 'optimizing', log)

    const optCount = await runPageOptimizer(ctx)
    log[2].status = 'completed'
    log[2].completedAt = new Date().toISOString()
    log[2].resultCount = optCount

    // Step C4: AOE Strategy
    log[3].status = 'running'
    log[3].startedAt = new Date().toISOString()
    await updateContentMap(ctx.contentMapId, 'aoe', log)

    const aoeCount = await runAoeStrategist(ctx)
    log[3].status = 'completed'
    log[3].completedAt = new Date().toISOString()
    log[3].resultCount = aoeCount

    // Step C5: Score & Prioritize
    log[4].status = 'running'
    log[4].startedAt = new Date().toISOString()
    await updateContentMap(ctx.contentMapId, 'scoring', log)

    await runScorer(ctx)
    log[4].status = 'completed'
    log[4].completedAt = new Date().toISOString()

    await updateContentMap(ctx.contentMapId, 'completed', log)
  } catch (error) {
    const failedIdx = log.findIndex((s) => s.status === 'running')
    if (failedIdx >= 0) {
      log[failedIdx].status = 'failed'
      log[failedIdx].error = error instanceof Error ? error.message : String(error)
    }
    await updateContentMap(ctx.contentMapId, 'failed', log)
    throw error
  }
}
