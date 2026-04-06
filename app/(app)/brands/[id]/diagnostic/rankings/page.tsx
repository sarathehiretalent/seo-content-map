import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { fetchSitemapStats } from '@/lib/services/sitemap'
import { RankingsClient } from './rankings-client'

export default async function RankingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  const keywords = await prisma.keyword.findMany({
    where: { brandId: id },
  })

  const diagnostic = await prisma.diagnostic.findFirst({
    where: { brandId: id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { cannibalization: true },
  })

  const cannibalization: Array<{ keyword: string; pages: string[]; recommendation: string }> =
    diagnostic?.cannibalization ? JSON.parse(diagnostic.cannibalization) : []

  // Get sitemap total for context
  let sitemapTotal: number | undefined
  try {
    const sitemap = await fetchSitemapStats(brand.domain)
    sitemapTotal = sitemap.totalUrls
  } catch { /* ignore */ }

  return <RankingsClient brand={brand} keywords={keywords} cannibalization={cannibalization} sitemapTotal={sitemapTotal} />
}
