import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const analysis = await prisma.serpAnalysis.findUnique({ where: { id } })
  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: analysis.id,
    status: analysis.status,
    pipelineLog: JSON.parse(analysis.pipelineLog),
  })
}
