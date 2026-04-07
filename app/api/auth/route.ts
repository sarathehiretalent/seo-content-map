import { NextRequest, NextResponse } from 'next/server'
import { login, logout, createUser, COOKIE_NAME, getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** POST /api/auth — login or setup */
export async function POST(request: NextRequest) {
  const { action, email, password, name } = await request.json()

  // ── Setup: create first admin user if none exist ──
  if (action === 'setup') {
    const userCount = await prisma.user.count()
    if (userCount > 0) return NextResponse.json({ error: 'Setup already completed' }, { status: 400 })
    if (!email || !password || !name) return NextResponse.json({ error: 'email, password, name required' }, { status: 400 })

    const user = await createUser({ email, password, name, role: 'admin' })

    // Auto-assign admin to all existing brands
    const brands = await prisma.brand.findMany({ select: { id: true } })
    for (const brand of brands) {
      await prisma.brandMember.create({ data: { userId: user.id, brandId: brand.id, role: 'analyst' } })
      await prisma.brand.update({ where: { id: brand.id }, data: { createdBy: user.id } })
    }

    const result = await login(email, password)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 })

    const res = NextResponse.json({ ok: true, user: result.user })
    res.cookies.set(COOKIE_NAME, result.token!, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400 })
    return res
  }

  // ── Login ──
  if (action === 'login') {
    if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 })
    const result = await login(email, password)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 })

    const res = NextResponse.json({ ok: true, user: result.user })
    res.cookies.set(COOKIE_NAME, result.token!, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400 })
    return res
  }

  // ── Logout ──
  if (action === 'logout') {
    await logout()
    const res = NextResponse.json({ ok: true })
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/** GET /api/auth — get current user */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ user: null })
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
}
