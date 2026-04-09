import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET — get fixed pages for latest audit */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const audit = await prisma.pageAudit.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { fixedPages: true },
  })

  return NextResponse.json({ fixedPages: audit?.fixedPages ? JSON.parse(audit.fixedPages) : [] })
}

/** POST — toggle fixed status for a page URL */
export async function POST(request: NextRequest) {
  const { brandId, url } = await request.json()
  if (!brandId || !url) return NextResponse.json({ error: 'brandId and url required' }, { status: 400 })

  const audit = await prisma.pageAudit.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, fixedPages: true },
  })
  if (!audit) return NextResponse.json({ error: 'No audit found' }, { status: 404 })

  const fixed: string[] = audit.fixedPages ? JSON.parse(audit.fixedPages) : []
  const idx = fixed.indexOf(url)
  if (idx >= 0) fixed.splice(idx, 1)
  else fixed.push(url)

  await prisma.pageAudit.update({
    where: { id: audit.id },
    data: { fixedPages: JSON.stringify(fixed) },
  })

  return NextResponse.json({ fixedPages: fixed })
}
