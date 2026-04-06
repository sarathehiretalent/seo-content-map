import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { OptimizeClient } from './optimize-client'

export default async function OptimizePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  // Check diagnostic exists
  const hasDiagnostic = await prisma.diagnostic.count({ where: { brandId: id, status: 'completed' } })

  // Get latest page audit
  const latestAudit = await prisma.pageAudit.findFirst({
    where: { brandId: id },
    orderBy: { createdAt: 'desc' },
  })

  // Quick wins from existing data (always available if diagnostic exists)
  const keywords = await prisma.keyword.findMany({
    where: { brandId: id, impressions: { gt: 0 } },
    orderBy: { impressions: 'desc' },
  })

  // Calculate quick wins from diagnostic data
  const pageMap: Record<string, { topKw: string; impressions: number; clicks: number; position: number; ctr: number }> = {}
  for (const kw of keywords) {
    if (!kw.pageUrl) continue
    if (!pageMap[kw.pageUrl]) pageMap[kw.pageUrl] = { topKw: kw.query, impressions: 0, clicks: 0, position: kw.position, ctr: 0 }
    pageMap[kw.pageUrl].impressions += kw.impressions
    pageMap[kw.pageUrl].clicks += kw.clicks
  }

  const quickWins = Object.entries(pageMap)
    .map(([url, data]) => {
      const ctr = data.impressions > 0 ? data.clicks / data.impressions : 0
      const type = data.impressions > 50 && ctr < 0.02 ? 'low_ctr' : data.position > 3 && data.position <= 15 ? 'position' : ''
      return { url, keyword: data.topKw, impressions: data.impressions, clicks: data.clicks, position: Math.round(data.position), ctr, type }
    })
    .filter((q) => q.type !== '')
    .sort((a, b) => b.impressions - a.impressions)

  return (
    <OptimizeClient
      brand={brand}
      hasDiagnostic={hasDiagnostic > 0}
      latestAudit={latestAudit}
      quickWins={quickWins}
    />
  )
}
