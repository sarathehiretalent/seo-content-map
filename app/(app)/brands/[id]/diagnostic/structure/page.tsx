import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { StructureClient } from './structure-client'

export default async function StructurePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const diagnostic = await prisma.diagnostic.findFirst({
    where: { brandId: id, status: 'completed' },
    orderBy: { createdAt: 'desc' },
  })

  if (!diagnostic) notFound()

  // Get all pages with their top keyword and impressions
  const keywords = await prisma.keyword.findMany({
    where: { brandId: id, pageUrl: { not: null } },
    select: { pageUrl: true, query: true, impressions: true },
  })

  const pageMap: Record<string, { topKeyword: string; totalImpressions: number; keywordCount: number }> = {}
  for (const kw of keywords) {
    const url = kw.pageUrl!
    if (!pageMap[url]) pageMap[url] = { topKeyword: '', totalImpressions: 0, keywordCount: 0 }
    pageMap[url].totalImpressions += kw.impressions
    pageMap[url].keywordCount++
    if (!pageMap[url].topKeyword || kw.impressions > 0) pageMap[url].topKeyword = kw.query
  }

  const allPages = Object.entries(pageMap).map(([url, data]) => ({
    url,
    topKeyword: data.topKeyword,
    impressions: data.totalImpressions,
    keywordCount: data.keywordCount,
  }))

  return (
    <StructureClient
      diagnostic={diagnostic}
      allPages={allPages}
    />
  )
}
