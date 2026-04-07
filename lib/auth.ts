import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { randomUUID, createHash } from 'crypto'

// ─── Password hashing (simple SHA-256 + salt for internal tool) ───

function hashPassword(password: string): string {
  const salt = randomUUID().slice(0, 16)
  const hash = createHash('sha256').update(salt + password).digest('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const check = createHash('sha256').update(salt + password).digest('hex')
  return check === hash
}

// ─── Session management ───

const SESSION_DAYS = 30
const COOKIE_NAME = 'seo_session'

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID() + randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)

  await prisma.session.create({ data: { userId, token, expiresAt } })
  return token
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  return session
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  return session.user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

// ─── Auth actions ───

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user || !user.isActive) return { error: 'Invalid email or password' }
  if (!verifyPassword(password, user.passwordHash)) return { error: 'Invalid email or password' }

  const token = await createSession(user.id)

  // Log activity
  await prisma.activityLog.create({ data: { userId: user.id, action: 'login' } })

  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { token } })
  }
}

export async function createUser(data: { email: string; password: string; name: string; role?: string }) {
  const passwordHash = hashPassword(data.password)
  return prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      role: data.role ?? 'user',
    },
  })
}

// ─── Brand permissions ───

export type BrandRole = 'viewer' | 'editor' | 'analyst'

export async function getUserBrandRole(userId: string, brandId: string): Promise<BrandRole | 'admin' | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null
  if (user.role === 'admin') return 'admin'

  const member = await prisma.brandMember.findUnique({
    where: { userId_brandId: { userId, brandId } },
  })
  return member?.role as BrandRole | null
}

export async function requireBrandAccess(userId: string, brandId: string): Promise<BrandRole | 'admin'> {
  const role = await getUserBrandRole(userId, brandId)
  if (!role) throw new Error('Forbidden')
  return role
}

export function canEdit(role: string): boolean {
  return ['editor', 'analyst', 'admin'].includes(role)
}

export function canGenerate(role: string): boolean {
  return ['analyst', 'admin'].includes(role)
}

export function canCreateBrands(role: string): boolean {
  return role === 'admin'
}

// ─── Activity logging ───

export async function logActivity(userId: string, action: string, brandId?: string, details?: Record<string, any>) {
  await prisma.activityLog.create({
    data: { userId, action, brandId, details: details ? JSON.stringify(details) : null },
  }).catch(() => {}) // Don't fail on logging errors
}

export { COOKIE_NAME, hashPassword }
