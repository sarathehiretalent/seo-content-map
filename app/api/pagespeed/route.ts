import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePageSpeed, batchAnalyzePageSpeed, type PageSpeedResult } from '@/lib/services/pagespeed'

/** GET — load cached PageSpeed results for a brand */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const cached = await prisma.apiCache.findFirst({
    where: { cacheKey: `pagespeed:${brandId}`, expiresAt: { gt: new Date() } },
  })
  if (cached) {
    try { return NextResponse.json(JSON.parse(cached.response)) } catch {}
  }
  return NextResponse.json(null)
}

/** POST — run PageSpeed analysis for brand's top pages */
export async function POST(request: NextRequest) {
  const { brandId, urls: customUrls } = await request.json()

  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Get URLs to analyze: custom list or top pages from Page Audit
  let urls: string[] = customUrls ?? []

  if (urls.length === 0) {
    // Get top pages from page audit
    const audit = await prisma.pageAudit.findFirst({
      where: { brandId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { auditData: true },
    })
    if (audit?.auditData) {
      const pages = JSON.parse(audit.auditData)
      urls = pages.map((p: any) => p.url).filter(Boolean)
    }
  }

  if (urls.length === 0) {
    // Fallback: get top pages from GSC keywords
    const keywords = await prisma.keyword.findMany({
      where: { brandId, pageUrl: { not: null }, impressions: { gt: 0 } },
      select: { pageUrl: true, impressions: true },
      orderBy: { impressions: 'desc' },
      take: 500,
    })
    const seen = new Set<string>()
    for (const kw of keywords) {
      if (kw.pageUrl && !seen.has(kw.pageUrl)) {
        seen.add(kw.pageUrl)
        urls.push(kw.pageUrl)
      }
    }
  }

  // Limit pages: 10 without API key (slow), 20 with key
  const hasKey = !!process.env.PAGESPEED_API_KEY
  const maxPages = hasKey ? 20 : 10
  urls = urls.slice(0, maxPages)

  if (urls.length === 0) {
    return NextResponse.json({ error: 'No pages found to analyze. Run Page Audit or Diagnostic first.' }, { status: 400 })
  }

  try {
    console.log(`[PageSpeed] Analyzing ${urls.length} pages for ${brand.domain} (API key: ${hasKey ? 'yes' : 'no'})`)

    const mobileResults = await batchAnalyzePageSpeed(urls, 'mobile')

    // Calculate summary
    const avgPerf = mobileResults.length > 0
      ? Math.round(mobileResults.reduce((s, r) => s + r.scores.performance, 0) / mobileResults.length)
      : 0
    const avgSeo = mobileResults.length > 0
      ? Math.round(mobileResults.reduce((s, r) => s + r.scores.seo, 0) / mobileResults.length)
      : 0
    const cwvPassing = mobileResults.filter((r) =>
      r.fieldData.overallCategory === 'FAST' || r.fieldData.overallCategory === 'AVERAGE'
    ).length
    const totalOpportunities = mobileResults.reduce((s, r) => s + r.opportunities.length, 0)

    const result = {
      pages: mobileResults,
      summary: {
        pagesAnalyzed: mobileResults.length,
        avgPerformance: avgPerf,
        avgSeo: avgSeo,
        cwvPassing,
        cwvTotal: mobileResults.filter((r) => r.fieldData.overallCategory !== null).length,
        totalOpportunities,
      },
      analyzedAt: new Date().toISOString(),
    }

    // Cache for 3 days
    const cacheKey = `pagespeed:${brandId}`
    await prisma.apiCache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        endpoint: 'pagespeed',
        response: JSON.stringify(result),
        expiresAt: new Date(Date.now() + 3 * 86400000),
      },
      update: {
        response: JSON.stringify(result),
        expiresAt: new Date(Date.now() + 3 * 86400000),
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[PageSpeed] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}
