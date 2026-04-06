import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const cm = await prisma.contentMap.findUnique({ where: { id } })
  if (!cm) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: cm.id,
    status: cm.status,
    pipelineLog: JSON.parse(cm.pipelineLog),
  })
}
