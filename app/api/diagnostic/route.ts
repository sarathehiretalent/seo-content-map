import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runDiagnosticPipeline } from '@/lib/agents/diagnostic-orchestrator'

export async function POST(request: NextRequest) {
  const { brandId } = await request.json()

  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const now = new Date()
  const diagnostic = await prisma.diagnostic.create({
    data: {
      brandId,
      name: `Diagnostic - ${now.toLocaleDateString()}`,
      status: 'pending',
    },
  })

  // Run pipeline in background (don't await)
  runDiagnosticPipeline({
    brandId,
    diagnosticId: diagnostic.id,
  }).catch((err) => {
    console.error('Diagnostic pipeline failed:', err)
  })

  return NextResponse.json({ diagnosticId: diagnostic.id })
}
