import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runAeoAnalysis } from '@/lib/agents/aeo-agent'

/** GET — load persisted AEO results */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const strategy = await prisma.aoeStrategy.findFirst({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
  })
  if (!strategy?.summary) return NextResponse.json(null)

  // summary stores JSON with { pages, summary }
  try {
    return NextResponse.json(JSON.parse(strategy.summary!))
  } catch {
    return NextResponse.json(null)
  }
}

/** POST — run AEO analysis and persist */
export async function POST(request: NextRequest) {
  const { brandId } = await request.json()

  const auditExists = await prisma.pageAudit.count({ where: { brandId, status: 'completed' } })
  if (auditExists === 0) {
    return NextResponse.json({ error: 'Run Page Audit in Optimize first' }, { status: 400 })
  }

  try {
    const result = await runAeoAnalysis(brandId)

    const now = new Date()
    // Upsert: one AEO record per brand (overwrite on re-analysis)
    const existing = await prisma.aoeStrategy.findFirst({ where: { brandId }, orderBy: { createdAt: 'desc' } })
    if (existing) {
      await prisma.aoeStrategy.update({
        where: { id: existing.id },
        data: { summary: JSON.stringify(result), updatedAt: now },
      })
    } else {
      await prisma.aoeStrategy.create({
        data: {
          brandId,
          name: `AEO Analysis`,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          summary: JSON.stringify(result),
        },
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

/** PATCH — toggle action done status */
export async function PATCH(request: NextRequest) {
  const { brandId, pagePath, actionIndex, done } = await request.json()
  if (!brandId || !pagePath || actionIndex === undefined) {
    return NextResponse.json({ error: 'brandId, pagePath, actionIndex required' }, { status: 400 })
  }

  const strategy = await prisma.aoeStrategy.findFirst({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
  })
  if (!strategy?.summary) {
    return NextResponse.json({ error: 'No AEO data found' }, { status: 404 })
  }

  const data = JSON.parse(strategy.summary)
  const page = data.pages?.find((p: any) => p.path === pagePath)
  if (!page || !page.actions?.[actionIndex]) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  }

  page.actions[actionIndex].done = !!done

  await prisma.aoeStrategy.update({
    where: { id: strategy.id },
    data: { summary: JSON.stringify(data) },
  })

  return NextResponse.json({ ok: true })
}
