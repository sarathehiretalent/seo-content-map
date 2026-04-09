import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditPages } from '@/lib/services/page-audit-scraper'
import { runAllOptimizeAgents } from '@/lib/agents/optimize-agents'
import { classifyKeywordsByIcp } from '@/lib/agents/icp-alignment'

export async function POST(request: NextRequest) {
  const { brandId, mode } = await request.json()
  // mode: 'traffic' (default) = pages with GSC data only
  // mode: 'sitemap' = next 25 pages from sitemap not yet audited
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  const kwCount = await prisma.keyword.count({ where: { brandId } })
  if (mode !== 'sitemap' && kwCount === 0) {
    return NextResponse.json({ error: 'Run diagnostic first' }, { status: 400 })
  }

  const audit = await prisma.pageAudit.create({
    data: { brandId, status: 'pending' },
  })

  runPageAuditPipeline(brandId, audit.id, mode ?? 'traffic').catch((err) => {
    console.error('[PageAudit] Failed:', err)
  })

  return NextResponse.json({ auditId: audit.id })
}

async function runPageAuditPipeline(brandId: string, auditId: string, mode: string = 'traffic') {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const log: Array<{ step: string; status: string; startedAt?: string; completedAt?: string; resultCount?: number; error?: string }> = [
    { step: 'Scraping pages (meta, schema, links)', status: 'pending' },
    { step: 'ICP alignment check', status: 'pending' },
    { step: 'Running 5 optimization agents', status: 'pending' },
  ]

  async function update(status: string, extra?: Record<string, string | null>) {
    await prisma.pageAudit.update({
      where: { id: auditId },
      data: { status, pipelineLog: JSON.stringify(log), ...extra },
    })
  }

  try {
    // ═══ Step 1: Scrape all pages ═══
    log[0].status = 'running'
    log[0].startedAt = new Date().toISOString()
    await update('running')

    let urls: string[] = []

    if (mode === 'traffic') {
      // Only pages with GSC data (have traffic)
      const gscPages = await prisma.keyword.findMany({
        where: { brandId, pageUrl: { not: null } },
        distinct: ['pageUrl'],
        select: { pageUrl: true },
      })
      urls = gscPages.map((p) => p.pageUrl!).filter(Boolean)
      console.log(`[PageAudit] Mode: traffic — ${urls.length} pages with GSC data`)
    } else {
      // Sitemap mode: get next 25 pages NOT already audited
      let sitemapUrls: string[] = []
      try {
        const { fetchSitemapUrls } = await import('@/lib/services/sitemap')
        sitemapUrls = await fetchSitemapUrls(brand.domain)
      } catch (e) {
        console.log(`[PageAudit] Sitemap fetch failed:`, e instanceof Error ? e.message : e)
      }

      // Get already audited URLs from previous audits
      const previousAudits = await prisma.pageAudit.findMany({
        where: { brandId, status: 'completed' },
        select: { auditData: true },
      })
      const auditedUrls = new Set<string>()
      for (const prev of previousAudits) {
        if (!prev.auditData) continue
        const pages = JSON.parse(prev.auditData)
        pages.forEach((p: any) => { if (p.url) auditedUrls.add(p.url) })
      }

      // Filter out already audited, take next 25
      urls = sitemapUrls.filter((u) => !auditedUrls.has(u)).slice(0, 25)
      console.log(`[PageAudit] Mode: sitemap — ${urls.length} new pages (${auditedUrls.size} already audited, ${sitemapUrls.length} total in sitemap)`)
    }

    const auditData = await auditPages(urls, brand.domain)

    log[0].status = 'completed'
    log[0].completedAt = new Date().toISOString()
    log[0].resultCount = auditData.length
    await update('running', { auditData: JSON.stringify(auditData) })

    // ═══ Step 2: ICP alignment for pages ═══
    log[1].status = 'running'
    log[1].startedAt = new Date().toISOString()
    await update('running')

    // Get top keyword per page for ICP check
    const keywords = await prisma.keyword.findMany({
      where: { brandId, impressions: { gt: 0 } },
      orderBy: { impressions: 'desc' },
    })

    const pageKeywordMap: Record<string, { keyword: string; impressions: number }> = {}
    for (const kw of keywords) {
      if (!kw.pageUrl) continue
      if (!pageKeywordMap[kw.pageUrl]) {
        pageKeywordMap[kw.pageUrl] = { keyword: kw.query, impressions: kw.impressions }
      }
    }

    // ICP check on page-level keywords
    const pageKeywords = Object.values(pageKeywordMap)
    const icpResults = await classifyKeywordsByIcp(brandId, pageKeywords.map((pk) => ({ keyword: pk.keyword })))

    // Build ICP map: url → alignment
    const icpMap: Record<string, string> = {}
    for (const [url, pk] of Object.entries(pageKeywordMap)) {
      const icp = icpResults.find((r) => r.keyword.toLowerCase() === pk.keyword.toLowerCase())
      icpMap[url] = icp?.alignment ?? 'unknown'
    }

    log[1].status = 'completed'
    log[1].completedAt = new Date().toISOString()
    log[1].resultCount = icpResults.length
    await update('running')

    // ═══ Step 3: Run 5 specialized agents in parallel ═══
    log[2].status = 'running'
    log[2].startedAt = new Date().toISOString()
    await update('running')

    // Get PAA data from SERP Analysis if available
    const serpAnalysis = await prisma.serpAnalysis.findFirst({
      where: { brandId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { serpPerformance: true },
    })

    // Get cannibalization data from Structure Analysis
    const diagnostic = await prisma.diagnostic.findFirst({
      where: { brandId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { cannibalization: true, currentStructure: true },
    })
    const cannibalization: Array<{ keyword: string; pages: string[]; recommendation: string }> = diagnostic?.cannibalization ? JSON.parse(diagnostic.cannibalization) : []

    // Get orphan pages from Structure Analysis
    const structureData = diagnostic?.currentStructure ? JSON.parse(diagnostic.currentStructure) : null
    const orphanPages: string[] = structureData?.orphanPages?.map((p: any) => p.path ?? p.url ?? p) ?? []
    console.log(`[PageAudit] Orphan pages from structure: ${orphanPages.length}`)
    const paaMap: Record<string, string[]> = {}
    if (serpAnalysis?.serpPerformance) {
      const perf = JSON.parse(serpAnalysis.serpPerformance)
      for (const item of perf) {
        if (item.features?.paaQuestions?.length > 0 && item.ourUrl) {
          const fullUrl = `https://${brand.domain}${item.ourUrl}`
          paaMap[fullUrl] = item.features.paaQuestions
        }
      }
    }

    const { fixes, summary } = await runAllOptimizeAgents(auditData, brand.domain, brand.name, pageKeywordMap, paaMap, cannibalization, orphanPages)

    log[2].status = 'completed'
    log[2].completedAt = new Date().toISOString()
    log[2].resultCount = fixes.length

    // ═══ Build Quick Wins from diagnostic data ═══
    const quickWins: Array<{ url: string; keyword: string; impressions: number; clicks: number; position: number; ctr: number; type: string; icpAlignment: string }> = []

    const pageStats: Record<string, { impressions: number; clicks: number; position: number }> = {}
    for (const kw of keywords) {
      if (!kw.pageUrl) continue
      if (!pageStats[kw.pageUrl]) pageStats[kw.pageUrl] = { impressions: 0, clicks: 0, position: kw.position }
      pageStats[kw.pageUrl].impressions += kw.impressions
      pageStats[kw.pageUrl].clicks += kw.clicks
    }

    for (const [url, stats] of Object.entries(pageStats)) {
      const ctr = stats.impressions > 0 ? stats.clicks / stats.impressions : 0
      const pk = pageKeywordMap[url]
      if (!pk) continue
      const alignment = icpMap[url] ?? 'unknown'

      if (stats.impressions > 50 && ctr < 0.02) {
        quickWins.push({ url, keyword: pk.keyword, impressions: stats.impressions, clicks: stats.clicks, position: Math.round(stats.position), ctr, type: 'low_ctr', icpAlignment: alignment })
      } else if (stats.position > 3 && stats.position <= 15 && stats.impressions > 30) {
        quickWins.push({ url, keyword: pk.keyword, impressions: stats.impressions, clicks: stats.clicks, position: Math.round(stats.position), ctr, type: 'position', icpAlignment: alignment })
      }
    }
    quickWins.sort((a, b) => b.impressions - a.impressions)

    // Add ICP data to audit results
    const auditWithIcp = auditData.map((a) => ({ ...a, icpAlignment: icpMap[a.url] ?? 'unknown' }))

    await update('completed', {
      auditData: JSON.stringify(auditWithIcp),
      quickWins: JSON.stringify(quickWins),
      recommendations: JSON.stringify(fixes),
      summary,
    })

    console.log(`[PageAudit] Complete! ${quickWins.length} quick wins, ${fixes.length} fixes`)
  } catch (error) {
    console.error('[PageAudit] FAILED:', error)
    const failedIdx = log.findIndex((s) => s.status === 'running')
    if (failedIdx >= 0) {
      log[failedIdx].status = 'failed'
      log[failedIdx].error = error instanceof Error ? error.message : String(error)
    }
    await update('failed')
  }
}
