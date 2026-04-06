import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { SerpAnalysisClient } from './serp-analysis-client'

export default async function SerpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  const latestAnalysis = await prisma.serpAnalysis.findFirst({
    where: { brandId: id },
    orderBy: { createdAt: 'desc' },
  })

  return <SerpAnalysisClient brand={brand} analysis={latestAnalysis} />
}
