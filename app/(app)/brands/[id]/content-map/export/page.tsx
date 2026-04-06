import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ExportClient } from './export-client'

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  const contentMap = await prisma.contentMap.findFirst({
    where: { brandId: id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contentPieces: true, pageOptimizations: true } },
    },
  })

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { brandId: id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <ExportClient
      brandId={id}
      brandName={brand.name}
      contentMap={contentMap}
      diagnostic={diagnostic}
    />
  )
}
