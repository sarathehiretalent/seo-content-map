import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { OverviewClient } from './overview-client'

export default async function BrandOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      _count: { select: { keywords: true, diagnostics: true, contentMaps: true } },
      diagnostics: { orderBy: { createdAt: 'desc' }, take: 1 },
      contentMaps: { orderBy: { createdAt: 'desc' }, take: 1 },
      keywords: {
        where: { impressions: { gt: 0 } },
        orderBy: { impressions: 'desc' },
        take: 10,
        select: { query: true, position: true, searchVolume: true, pageUrl: true, clicks: true, impressions: true },
      },
    },
  })

  if (!brand) notFound()

  // Get site pages count from scraped data
  const sitePages: Array<{ url: string }> = brand.sitePages ? JSON.parse(brand.sitePages) : []

  // Check completion of each section
  const hasPageAudit = await prisma.pageAudit.count({ where: { brandId: id, status: 'completed' } }) > 0
  const hasContentMap = brand.contentMaps[0]?.status === 'completed'
  const hasAeo = await prisma.aoeStrategy.count({ where: { brandId: id } }) > 0
  const hasSpeed = await prisma.apiCache.count({ where: { cacheKey: `pagespeed:${id}` } }) > 0
  const hasPerformance = await prisma.performanceSnapshot.count({ where: { brandId: id } }) > 0

  // Keyword stats from DB
  const allKeywords = await prisma.keyword.findMany({
    where: { brandId: id },
    select: { position: true, clicks: true, impressions: true, searchVolume: true },
  })

  const totalClicks = allKeywords.reduce((s, k) => s + k.clicks, 0)
  const totalImpressions = allKeywords.reduce((s, k) => s + k.impressions, 0)
  const withPosition = allKeywords.filter((k) => k.position > 0)
  const avgPosition = withPosition.length > 0
    ? withPosition.reduce((s, k) => s + k.position, 0) / withPosition.length
    : 0
  const totalVolume = allKeywords.reduce((s, k) => s + (k.searchVolume ?? 0), 0)
  const top3 = withPosition.filter((k) => k.position <= 3).length
  const top10 = withPosition.filter((k) => k.position <= 10).length

  return (
    <OverviewClient
      brand={brand}
      topKeywords={brand.keywords}
      stats={{
        totalKeywords: brand._count.keywords,
        totalClicks,
        totalImpressions,
        avgPosition,
        totalVolume,
        top3,
        top10,
        sitePages: sitePages.length,
        diagnostics: brand._count.diagnostics,
        contentMaps: brand._count.contentMaps,
        lastDiagStatus: brand.diagnostics[0]?.status ?? null,
        lastMapStatus: brand.contentMaps[0]?.status ?? null,
        hasPageAudit,
        hasContentMap,
        hasAeo,
        hasSpeed,
        hasPerformance,
      }}
    />
  )
}
