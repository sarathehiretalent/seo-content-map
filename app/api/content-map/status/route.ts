import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const contentMapId = request.nextUrl.searchParams.get('id')

  if (!contentMapId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const contentMap = await prisma.contentMap.findUnique({
    where: { id: contentMapId },
    include: { _count: { select: { contentPieces: true, pageOptimizations: true } } },
  })

  if (!contentMap) {
    return NextResponse.json({ error: 'Content map not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: contentMap.id,
    status: contentMap.status,
    pipelineLog: JSON.parse(contentMap.pipelineLog),
    contentPiecesCount: contentMap._count.contentPieces,
    pageOptimizationsCount: contentMap._count.pageOptimizations,
  })
}
