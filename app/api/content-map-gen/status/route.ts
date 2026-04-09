import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  const contentMapId = request.nextUrl.searchParams.get('contentMapId')
  const pieceId = request.nextUrl.searchParams.get('pieceId')

  const cmId = id || contentMapId
  if (!cmId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const cm = await prisma.contentMap.findUnique({ where: { id: cmId }, select: { id: true, status: true, pipelineLog: true, briefs: true } })
  if (!cm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if brief exists for specific piece
  let hasBrief = false
  if (pieceId && cm.briefs) {
    const briefs = JSON.parse(cm.briefs)
    hasBrief = briefs.some((b: any) => b.pieceId === pieceId)
  }

  return NextResponse.json({
    id: cm.id,
    status: cm.status,
    pipelineLog: JSON.parse(cm.pipelineLog),
    hasBrief,
  })
}
