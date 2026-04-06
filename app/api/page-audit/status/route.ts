import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const audit = await prisma.pageAudit.findUnique({ where: { id } })
  if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: audit.id,
    status: audit.status,
    pipelineLog: JSON.parse(audit.pipelineLog),
  })
}
