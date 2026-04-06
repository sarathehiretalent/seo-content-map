import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ContentMapClient } from './content-map-client'

export default async function ContentMapPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  const hasDiagnostic = await prisma.diagnostic.count({ where: { brandId: id, status: 'completed' } })

  // Get ALL content maps for this brand (accumulated months)
  const allMaps = await prisma.contentMap.findMany({
    where: { brandId: id, status: 'completed' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, quarter: true, keywordPool: true, mapData: true, briefs: true, summary: true, createdAt: true, status: true },
  })

  // Also get the latest (could be in progress or failed)
  const latestMap = await prisma.contentMap.findFirst({
    where: { brandId: id },
    orderBy: { createdAt: 'desc' },
  })

  return <ContentMapClient brand={brand} hasDiagnostic={hasDiagnostic > 0} allMaps={allMaps} latestMap={latestMap} />
}
