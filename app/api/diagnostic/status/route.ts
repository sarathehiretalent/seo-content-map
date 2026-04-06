import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const diagnosticId = request.nextUrl.searchParams.get('id')

  if (!diagnosticId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const diagnostic = await prisma.diagnostic.findUnique({
    where: { id: diagnosticId },
  })

  if (!diagnostic) {
    return NextResponse.json({ error: 'Diagnostic not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: diagnostic.id,
    status: diagnostic.status,
    pipelineLog: JSON.parse(diagnostic.pipelineLog),
    summary: diagnostic.summary,
  })
}
