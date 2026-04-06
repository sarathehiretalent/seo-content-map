import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runCurrentStructure } from '@/lib/agents/current-structure'

export async function POST() {
  const brand = await prisma.brand.findFirst()
  if (!brand) return NextResponse.json({ error: 'No brand' }, { status: 400 })

  const diag = await prisma.diagnostic.findFirst({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
  })
  if (!diag) return NextResponse.json({ error: 'No diagnostic' }, { status: 400 })

  console.log('[RunStructure] Running structure agent only...')
  const result = await runCurrentStructure({ brandId: brand.id, diagnosticId: diag.id })

  await prisma.diagnostic.update({
    where: { id: diag.id },
    data: {
      currentStructure: JSON.stringify(result.structure),
      gaps: JSON.stringify(result.gaps),
      cannibalization: JSON.stringify(result.cannibalization),
      summary: result.summary,
    },
  })

  return NextResponse.json({
    pillars: result.structure.pillars?.length,
    orphans: result.structure.orphanPages?.length,
    gaps: result.gaps?.length,
    cannibalization: result.cannibalization?.length,
  })
}
