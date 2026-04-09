import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { contentMapId } = await request.json()
  if (!contentMapId) return NextResponse.json({ error: 'contentMapId required' }, { status: 400 })

  await prisma.contentMap.delete({ where: { id: contentMapId } })

  return NextResponse.json({ ok: true })
}
