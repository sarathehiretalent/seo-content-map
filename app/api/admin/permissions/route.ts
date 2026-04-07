import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, logActivity } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const admin = await requireAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, brandId, role } = await request.json()
  if (!userId || !brandId || !role) return NextResponse.json({ error: 'userId, brandId, role required' }, { status: 400 })
  if (!['viewer', 'editor', 'analyst'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  await prisma.brandMember.upsert({
    where: { userId_brandId: { userId, brandId } },
    create: { userId, brandId, role },
    update: { role },
  })

  await logActivity(admin.id, 'assign_brand_access', brandId, { userId, role })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { memberId, role } = await request.json()
  if (!memberId || !role) return NextResponse.json({ error: 'memberId, role required' }, { status: 400 })

  await prisma.brandMember.update({ where: { id: memberId }, data: { role } })
  await logActivity(admin.id, 'change_brand_role', undefined, { memberId, role })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { memberId } = await request.json()
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 })

  await prisma.brandMember.delete({ where: { id: memberId } })
  await logActivity(admin.id, 'remove_brand_access', undefined, { memberId })
  return NextResponse.json({ ok: true })
}
