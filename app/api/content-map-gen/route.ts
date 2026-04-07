import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildKeywordPool } from '@/lib/agents/content-map/keyword-pool-builder'
import { runContentStrategist } from '@/lib/agents/content-map/content-strategist'
import { runContentBriefs } from '@/lib/agents/content-map/content-brief'
import { runQualityReview } from '@/lib/agents/content-map/quality-reviewer'

export async function POST(request: NextRequest) {
  const { brandId, action, pillarName, contentMapId, pieceId } = await request.json()

  // ── Action: generate (initial — discovers topics and creates pillar structure) ──
  if (!action || action === 'generate') {
    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
    const kwCount = await prisma.keyword.count({ where: { brandId } })
    if (kwCount === 0) return NextResponse.json({ error: 'Run diagnostic first' }, { status: 400 })

    const now = new Date()
    const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`
    const cm = await prisma.contentMap.create({
      data: { brandId, name: `Content Map — ${quarter}`, quarter, status: 'pending' },
    })

    runGeneratePipeline(brandId, cm.id).catch(console.error)
    return NextResponse.json({ contentMapId: cm.id })
  }

  // ── Action: expand-pillar (generates briefs for one pillar) ──
  if (action === 'expand-pillar' && contentMapId && pillarName) {
    runExpandPillar(contentMapId, pillarName).catch(console.error)
    return NextResponse.json({ ok: true })
  }

  // ── Action: generate-brief (generates brief for ONE keyword) ──
  if (action === 'generate-brief' && contentMapId) {
    if (!pieceId) return NextResponse.json({ error: 'pieceId required' }, { status: 400 })
    runSingleBrief(contentMapId, pieceId, brandId).catch(console.error)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * Phase 1: Discover topics → validate keywords → create pillar/cluster structure
 * NO briefs yet — user reviews pillars first
 */
async function runGeneratePipeline(brandId: string, contentMapId: string) {
  const log = [
    { step: 'Building keyword pool (GSC + DataForSEO + AI)', status: 'pending', startedAt: '', completedAt: '', resultCount: 0, error: '' },
    { step: 'Organizing pillar/cluster map', status: 'pending', startedAt: '', completedAt: '', resultCount: 0, error: '' },
    { step: 'Quality review', status: 'pending', startedAt: '', completedAt: '', resultCount: 0, error: '' },
  ]

  const update = async (status: string, extra?: Record<string, string | null>) => {
    await prisma.contentMap.update({ where: { id: contentMapId }, data: { status, pipelineLog: JSON.stringify(log), ...extra } })
  }

  try {
    // Step 1: Build keyword pool from real data
    log[0].status = 'running'; log[0].startedAt = new Date().toISOString()
    await update('running')
    const keywordPool = await buildKeywordPool(brandId)
    log[0].status = 'completed'; log[0].completedAt = new Date().toISOString(); log[0].resultCount = keywordPool.length
    await update('running', { keywordPool: JSON.stringify(keywordPool) })

    // Step 2: Organize into pillar/cluster structure
    log[1].status = 'running'; log[1].startedAt = new Date().toISOString()
    await update('running')
    const pieces = await runContentStrategist(brandId, keywordPool)
    log[1].status = 'completed'; log[1].completedAt = new Date().toISOString(); log[1].resultCount = pieces.length

    // Step 3: Quality review
    log[2].status = 'running'; log[2].startedAt = new Date().toISOString()
    await update('running')
    const review = await runQualityReview(brandId, pieces)
    const finalPieces = pieces.filter((p) => !review.removedPieces?.includes(p.id))
    log[2].status = 'completed'; log[2].completedAt = new Date().toISOString(); log[2].resultCount = finalPieces.length

    await update('completed', {
      mapData: JSON.stringify(finalPieces),
      reviewResult: JSON.stringify(review),
      summary: review.summary,
    })
    console.log(`[ContentMap] Complete: ${finalPieces.length} pieces`)
  } catch (error: any) {
    const failedIdx = log.findIndex((s) => s.status === 'running')
    if (failedIdx >= 0) { log[failedIdx].status = 'failed'; log[failedIdx].error = error.message ?? String(error) }
    await update('failed')
    console.error('[ContentMap] Failed:', error)
  }
}

/**
 * Phase 2: Generate briefs for ONE pillar at a time
 * Called when user clicks "Generate Briefs" on a specific pillar
 */
async function runExpandPillar(contentMapId: string, pillarName: string) {
  const cm = await prisma.contentMap.findUniqueOrThrow({ where: { id: contentMapId } })
  const pieces = JSON.parse(cm.mapData ?? '[]')
  const existingBriefs = JSON.parse(cm.briefs ?? '[]')

  const pillarPieces = pieces.filter((p: any) => p.pillarName === pillarName && p.status === 'to_create')
  if (pillarPieces.length === 0) return

  console.log(`[ContentMap] Generating briefs for pillar "${pillarName}" (${pillarPieces.length} pieces)`)

  const newBriefs = await runContentBriefs(cm.brandId, pillarPieces)
  const allBriefs = [...existingBriefs, ...newBriefs]

  await prisma.contentMap.update({
    where: { id: contentMapId },
    data: { briefs: JSON.stringify(allBriefs) },
  })

  console.log(`[ContentMap] Briefs generated: ${newBriefs.length} new, ${allBriefs.length} total`)
}

/**
 * Generate brief for a SINGLE keyword/piece
 */
async function runSingleBrief(contentMapId: string, pieceId: string, brandId: string) {
  const cm = await prisma.contentMap.findUniqueOrThrow({ where: { id: contentMapId } })
  const pieces = JSON.parse(cm.mapData ?? '[]')
  const existingBriefs = JSON.parse(cm.briefs ?? '[]')

  const piece = pieces.find((p: any) => p.id === pieceId)
  if (!piece) return

  // Check if brief already exists
  if (existingBriefs.some((b: any) => b.pieceId === pieceId)) return

  console.log(`[ContentMap] Generating brief for: ${piece.targetKeyword}`)

  const newBriefs = await runContentBriefs(brandId, [piece])
  const allBriefs = [...existingBriefs, ...newBriefs]

  await prisma.contentMap.update({
    where: { id: contentMapId },
    data: { briefs: JSON.stringify(allBriefs) },
  })

  console.log(`[ContentMap] Brief generated for ${piece.targetKeyword}`)
}
