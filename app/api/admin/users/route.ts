import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, createUser, logActivity } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const admin = await requireAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, name, password } = await request.json()
  if (!email || !name || !password) return NextResponse.json({ error: 'email, name, password required' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) return NextResponse.json({ error: 'Email already exists' }, { status: 400 })

  const user = await createUser({ email, password, name })
  await logActivity(admin.id, 'create_user', undefined, { newUserId: user.id, email })
  return NextResponse.json({ ok: true, userId: user.id })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, isActive, name, password } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const data: Record<string, any> = {}
  if (isActive !== undefined) data.isActive = isActive
  if (name) data.name = name
  if (password) {
    const { hashPassword } = await import('@/lib/auth')
    data.passwordHash = hashPassword(password)
  }

  await prisma.user.update({ where: { id: userId }, data })
  await logActivity(admin.id, isActive === false ? 'deactivate_user' : 'update_user', undefined, { userId })
  return NextResponse.json({ ok: true })
}
