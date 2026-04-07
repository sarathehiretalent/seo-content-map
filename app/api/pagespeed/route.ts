import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePageSpeed, type PageSpeedResult } from '@/lib/services/pagespeed'
import { callClaude } from '@/lib/services/anthropic'

/** GET — load cached results or progress */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  // Check progress first
  const progress = await prisma.apiCache.findFirst({
    where: { cacheKey: `pagespeed-progress:${brandId}` },
  })
  if (progress) {
    try {
      const p = JSON.parse(progress.response)
      if (p.status === 'running') return NextResponse.json(p)
    } catch {}
  }

  // Return completed data
  const cached = await prisma.apiCache.findFirst({
    where: { cacheKey: `pagespeed:${brandId}`, expiresAt: { gt: new Date() } },
  })
  if (cached) {
    try {
      const data = JSON.parse(cached.response)
      if (data?.globalIssues) return NextResponse.json({ status: 'completed', ...data })
    } catch {}
  }
  return NextResponse.json(null)
}

/** PATCH — toggle action done */
export async function PATCH(request: NextRequest) {
  const { brandId, actionId, done } = await request.json()
  if (!brandId || !actionId) return NextResponse.json({ error: 'brandId, actionId required' }, { status: 400 })

  const cached = await prisma.apiCache.findFirst({
    where: { cacheKey: `pagespeed:${brandId}`, expiresAt: { gt: new Date() } },
  })
  if (!cached) return NextResponse.json({ error: 'No data' }, { status: 404 })

  const data = JSON.parse(cached.response)
  const gi = data.globalIssues?.find((g: any) => g.id === actionId)
  if (gi) gi.done = !!done
  for (const page of data.pages ?? []) {
    const opp = page.opportunities?.find((o: any) => `${page.url}:${o.id}` === actionId)
    if (opp) opp.done = !!done
  }

  await prisma.apiCache.update({ where: { id: cached.id }, data: { response: JSON.stringify(data) } })
  return NextResponse.json({ ok: true })
}

/** POST — start analysis (runs in background) */
export async function POST(request: NextRequest) {
  const { brandId } = await request.json()
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Get top pages by impressions
  const keywords = await prisma.keyword.findMany({
    where: { brandId, pageUrl: { not: null }, impressions: { gt: 0 } },
    select: { pageUrl: true, impressions: true },
    orderBy: { impressions: 'desc' },
  })

  const pageImpressions = new Map<string, number>()
  for (const kw of keywords) {
    if (!kw.pageUrl) continue
    pageImpressions.set(kw.pageUrl, (pageImpressions.get(kw.pageUrl) ?? 0) + kw.impressions)
  }

  let topPages = [...pageImpressions.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url, impressions]) => ({ url, impressions }))

  const hasKey = !!process.env.PAGESPEED_API_KEY
  const maxPages = hasKey ? 20 : 10
  topPages = topPages.slice(0, maxPages)

  if (topPages.length === 0) {
    return NextResponse.json({ error: 'No pages with impressions found. Run Diagnostic first.' }, { status: 400 })
  }

  // Save initial progress
  const progressKey = `pagespeed-progress:${brandId}`
  await prisma.apiCache.upsert({
    where: { cacheKey: progressKey },
    create: { cacheKey: progressKey, endpoint: 'pagespeed-progress', response: JSON.stringify({ status: 'running', done: 0, total: topPages.length, currentUrl: topPages[0].url }), expiresAt: new Date(Date.now() + 3600000) },
    update: { response: JSON.stringify({ status: 'running', done: 0, total: topPages.length, currentUrl: topPages[0].url }), expiresAt: new Date(Date.now() + 3600000) },
  })

  // Run in background
  runAnalysis(brandId, brand.domain, topPages, pageImpressions, maxPages, progressKey).catch(console.error)

  return NextResponse.json({ started: true, total: topPages.length })
}

async function runAnalysis(
  brandId: string, domain: string,
  topPages: Array<{ url: string; impressions: number }>,
  pageImpressions: Map<string, number>,
  maxPages: number, progressKey: string,
) {
  const results: (PageSpeedResult & { impressions: number })[] = []
  const hasKey = !!process.env.PAGESPEED_API_KEY
  const delayMs = hasKey ? 1500 : 3000

  for (let i = 0; i < topPages.length; i++) {
    const { url } = topPages[i]
    try {
      // Update progress
      await prisma.apiCache.update({
        where: { cacheKey: progressKey },
        data: { response: JSON.stringify({ status: 'running', done: i, total: topPages.length, currentUrl: url }) },
      })

      const result = await analyzePageSpeed(url, 'mobile')
      results.push({
        ...result,
        impressions: pageImpressions.get(url) ?? 0,
        opportunities: result.opportunities.map((o) => ({ ...o, done: false })),
      } as any)
    } catch (err: any) {
      console.error(`[PageSpeed] Failed: ${url} — ${err?.message}`)
      if (err?.message?.includes('429')) {
        await new Promise((r) => setTimeout(r, 10000))
      }
    }

    if (i < topPages.length - 1) await new Promise((r) => setTimeout(r, delayMs))
  }

  results.sort((a, b) => b.impressions - a.impressions)

  // Group global issues
  const issueMap = new Map<string, { id: string; title: string; description: string; pages: string[]; totalSavingsMs: number }>()
  for (const page of results) {
    for (const opp of (page as any).opportunities ?? page.opportunities) {
      const existing = issueMap.get(opp.id)
      if (existing) {
        existing.pages.push(new URL(page.url).pathname)
        existing.totalSavingsMs += opp.savingsMs
      } else {
        issueMap.set(opp.id, { id: opp.id, title: opp.title, description: opp.description, pages: [new URL(page.url).pathname], totalSavingsMs: opp.savingsMs })
      }
    }
  }
  const globalIssues = [...issueMap.values()]
    .map((g) => ({ ...g, avgSavingsMs: Math.round(g.totalSavingsMs / g.pages.length), done: false }))
    .sort((a, b) => b.pages.length - a.pages.length)

  // Stats
  const healthy = results.filter((p) => p.scores.performance >= 70).length
  const unhealthy = results.filter((p) => p.scores.performance < 70).length
  const avgPerf = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.scores.performance, 0) / results.length) : 0
  const cwvWithData = results.filter((r) => r.fieldData.overallCategory !== null)
  const cwvPassing = cwvWithData.filter((r) => r.fieldData.overallCategory === 'FAST' || r.fieldData.overallCategory === 'AVERAGE').length

  // AI summary
  let aiSummary = ''
  try {
    const summaryInput = {
      pagesAnalyzed: results.length, avgPerformance: avgPerf, healthy, unhealthy,
      cwv: cwvWithData.length > 0 ? `${cwvPassing}/${cwvWithData.length} passing` : 'No field data available',
      topIssues: globalIssues.slice(0, 5).map((g) => `${g.title} (${g.pages.length} pages, avg ${g.avgSavingsMs}ms savings)`),
      worstPages: results.filter((p) => p.scores.performance < 70).slice(0, 3).map((p) => `${new URL(p.url).pathname} (score ${p.scores.performance}, ${p.impressions.toLocaleString()} impr)`),
    }
    const r = await callClaude<{ summary: string }>({
      system: 'You are an SEO expert analyzing PageSpeed results. Write a concise 2-3 sentence summary in English. Focus on: how many pages have issues, the biggest global problem, and potential impact on rankings. Be specific with numbers. No fluff.',
      prompt: `Results:\n${JSON.stringify(summaryInput)}\n\nReturn: { "summary": "..." }`,
      maxTokens: 300,
    })
    aiSummary = r.summary ?? ''
  } catch {
    aiSummary = `Analyzed ${results.length} pages. ${unhealthy} have performance issues (score < 70). ${globalIssues[0] ? `Top issue: "${globalIssues[0].title}" affects ${globalIssues[0].pages.length} pages.` : ''}`
  }

  const output = {
    pages: results,
    globalIssues,
    summary: {
      pagesAnalyzed: results.length, maxPages,
      avgPerformance: avgPerf,
      healthy, unhealthy,
      cwvPassing, cwvTotal: cwvWithData.length,
      totalGlobalIssues: globalIssues.length,
    },
    aiSummary,
    analyzedAt: new Date().toISOString(),
  }

  // Save result
  const cacheKey = `pagespeed:${brandId}`
  await prisma.apiCache.upsert({
    where: { cacheKey },
    create: { cacheKey, endpoint: 'pagespeed', response: JSON.stringify(output), expiresAt: new Date(Date.now() + 3 * 86400000) },
    update: { response: JSON.stringify(output), expiresAt: new Date(Date.now() + 3 * 86400000) },
  })

  // Clear progress
  await prisma.apiCache.delete({ where: { cacheKey: progressKey } }).catch(() => {})

  console.log(`[PageSpeed] Done: ${results.length} pages, ${globalIssues.length} global issues`)
}
