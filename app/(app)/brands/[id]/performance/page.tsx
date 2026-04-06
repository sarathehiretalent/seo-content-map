import { prisma } from '@/lib/prisma'
import { PerformanceClient } from './performance-client'

export default async function PerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id }, select: { id: true, domain: true, gscProperty: true } })
  return <PerformanceClient brand={brand} />
}
