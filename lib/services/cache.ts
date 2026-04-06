import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export function makeCacheKey(endpoint: string, params: Record<string, unknown>): string {
  const raw = `${endpoint}:${JSON.stringify(params, Object.keys(params).sort())}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await prisma.apiCache.findUnique({ where: { cacheKey: key } })
  if (!entry) return null
  if (new Date(entry.expiresAt) < new Date()) {
    await prisma.apiCache.delete({ where: { cacheKey: key } }).catch(() => {})
    return null
  }
  return JSON.parse(entry.response) as T
}

export async function setCache(
  key: string,
  endpoint: string,
  data: unknown,
  ttlDays: number
): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + ttlDays)

  await prisma.apiCache.upsert({
    where: { cacheKey: key },
    update: {
      response: JSON.stringify(data),
      expiresAt,
    },
    create: {
      cacheKey: key,
      endpoint,
      response: JSON.stringify(data),
      expiresAt,
    },
  })
}

export async function invalidateCache(keyPattern: string): Promise<number> {
  const result = await prisma.apiCache.deleteMany({
    where: { cacheKey: { contains: keyPattern } },
  })
  return result.count
}

export async function cleanExpiredCache(): Promise<number> {
  const result = await prisma.apiCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return result.count
}
