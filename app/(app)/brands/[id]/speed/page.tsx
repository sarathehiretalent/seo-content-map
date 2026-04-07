import { prisma } from '@/lib/prisma'
import { SpeedClient } from './speed-client'

export default async function SpeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id }, select: { id: true, domain: true } })
  return <SpeedClient brand={brand} />
}
