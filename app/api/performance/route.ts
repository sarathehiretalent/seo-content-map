import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google-auth'
import { fetchRankings, fetchOverview, type GscRanking } from '@/lib/services/gsc'
import { callClaude } from '@/lib/services/anthropic'

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  const period = parseInt(request.nextUrl.searchParams.get('period') ?? '28')
  const refresh = request.nextUrl.searchParams.get('refresh') === '1'
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  if (!brand.gscProperty) return NextResponse.json({ error: 'GSC not connected. Go to Settings to connect.' }, { status: 400 })

  // Serve cached data unless refresh requested
  if (!refresh) {
    const cacheKey = `performance:${brandId}:${period}`
    const cached = await prisma.apiCache.findFirst({
      where: { cacheKey, expiresAt: { gt: new Date() } },
    })
    if (cached) {
      try { return NextResponse.json({ ...JSON.parse(cached.response), cached: true }) } catch {}
    }
  }

  try {
    const now = new Date()
    const delay = 3 * 86400000
    const currentEnd = new Date(now.getTime() - delay)
    const currentStart = new Date(currentEnd.getTime() - period * 86400000)
    const previousEnd = new Date(currentStart.getTime() - 86400000)
    const previousStart = new Date(previousEnd.getTime() - period * 86400000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    // Fetch GSC data
    const emptyOv = { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, totalPages: 0, dateRange: { start: '', end: '' } }
    const results = await Promise.allSettled([
      fetchOverview(brand.gscProperty!, fmt(currentStart), fmt(currentEnd)),
      fetchOverview(brand.gscProperty!, fmt(previousStart), fmt(previousEnd)),
      fetchRankings(brand.gscProperty!, { startDate: fmt(currentStart), endDate: fmt(currentEnd), rowLimit: 5000 }),
      fetchRankings(brand.gscProperty!, { startDate: fmt(previousStart), endDate: fmt(previousEnd), rowLimit: 5000 }),
    ])

    const currentOverview = results[0].status === 'fulfilled' ? results[0].value : emptyOv
    const previousOverview = results[1].status === 'fulfilled' ? results[1].value : emptyOv
    const currentRankings = results[2].status === 'fulfilled' ? results[2].value : []
    const previousRankings = results[3].status === 'fulfilled' ? results[3].value : []

    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`[Performance] Query ${i} failed:`, r.reason?.message) })

    // Keyword maps
    const currentKwMap = new Map<string, GscRanking>()
    for (const kw of currentRankings) currentKwMap.set(kw.query, kw)
    const previousKwMap = new Map<string, GscRanking>()
    for (const kw of previousRankings) previousKwMap.set(kw.query, kw)

    // Collect content map target keywords for tagging
    const contentMaps = await prisma.contentMap.findMany({ where: { brandId, status: 'completed' }, select: { mapData: true } })
    const cmTargetKws = new Set<string>()
    for (const cm of contentMaps) {
      const pieces = cm.mapData ? JSON.parse(cm.mapData) : []
      for (const p of pieces) { if (p.targetKeyword) cmTargetKws.add(p.targetKeyword.toLowerCase()) }
    }

    // Movement
    const winners: any[] = [], losers: any[] = [], newKws: any[] = [], lostKws: any[] = []
    for (const [query, cur] of currentKwMap) {
      const prev = previousKwMap.get(query)
      const inCM = cmTargetKws.has(query.toLowerCase())
      if (prev) {
        const change = prev.position - cur.position
        if (change >= 3) winners.push({ query, page: cur.page, currentPos: cur.position, previousPos: prev.position, change, clicks: cur.clicks, impressions: cur.impressions, inContentMap: inCM })
        else if (change <= -3) losers.push({ query, page: cur.page, currentPos: cur.position, previousPos: prev.position, change, clicks: cur.clicks, impressions: cur.impressions, inContentMap: inCM })
      } else newKws.push({ query, page: cur.page, position: cur.position, clicks: cur.clicks, impressions: cur.impressions, inContentMap: inCM })
    }
    for (const [query, prev] of previousKwMap) { if (!currentKwMap.has(query)) lostKws.push({ query, page: prev.page, position: prev.position, clicks: prev.clicks, impressions: prev.impressions, inContentMap: cmTargetKws.has(query.toLowerCase()) }) }
    winners.sort((a, b) => b.change - a.change); losers.sort((a, b) => a.change - b.change)
    newKws.sort((a, b) => b.impressions - a.impressions); lostKws.sort((a, b) => b.impressions - a.impressions)

    // Distribution
    const dist = (rankings: GscRanking[]) => {
      const kws = new Map<string, number>()
      for (const r of rankings) { if (!kws.has(r.query) || r.position < kws.get(r.query)!) kws.set(r.query, r.position) }
      const pos = [...kws.values()]
      return { top3: pos.filter((p) => p <= 3).length, top10: pos.filter((p) => p <= 10).length, top20: pos.filter((p) => p <= 20).length, top50: pos.filter((p) => p <= 50).length, total: pos.length }
    }
    const currentDist = dist(currentRankings)
    const previousDist = dist(previousRankings)

    // Top keywords per position range (for expandable sections)
    const bestPerKw = new Map<string, GscRanking>()
    for (const r of currentRankings) {
      const existing = bestPerKw.get(r.query)
      if (!existing || r.position < existing.position) bestPerKw.set(r.query, r)
    }
    const allBest = [...bestPerKw.values()].sort((a, b) => b.impressions - a.impressions)
    const enrichKw = (r: GscRanking) => {
      const path = r.page ? (() => { try { return new URL(r.page).pathname } catch { return r.page } })() : null
      return {
        query: r.query, position: r.position, clicks: r.clicks, impressions: r.impressions, page: r.page,
        inContentMap: cmTargetKws.has(r.query.toLowerCase()),
        isHomepage: path === '/' || path === '',
      }
    }
    const topKwsByRange = {
      top3: allBest.filter((r) => r.position <= 3).slice(0, 10).map(enrichKw),
      pos4to10: allBest.filter((r) => r.position > 3 && r.position <= 10).slice(0, 10).map(enrichKw),
      pos11to20: allBest.filter((r) => r.position > 10 && r.position <= 20).slice(0, 10).map(enrichKw),
      pos21to50: allBest.filter((r) => r.position > 20 && r.position <= 50).slice(0, 10).map(enrichKw),
    }

    // Striking distance
    const strikingDistance = currentRankings.filter((r) => r.position >= 11 && r.position <= 20 && r.impressions >= 50).sort((a, b) => b.impressions - a.impressions).slice(0, 15)

    // Cannibalization detection (same keyword, multiple pages, >10 impressions each)
    const kwPages = new Map<string, GscRanking[]>()
    for (const r of currentRankings) {
      if (r.impressions < 10) continue
      if (!kwPages.has(r.query)) kwPages.set(r.query, [])
      kwPages.get(r.query)!.push(r)
    }
    const cannibalization = [...kwPages.entries()]
      .filter(([, pages]) => pages.length >= 2)
      .map(([query, pages]) => {
        pages.sort((a, b) => a.position - b.position)
        const totalImpr = pages.reduce((s, p) => s + p.impressions, 0)
        const totalClicks = pages.reduce((s, p) => s + p.clicks, 0)
        return {
          keyword: query,
          totalImpressions: totalImpr,
          totalClicks,
          pages: pages.map((p) => ({
            url: p.page, position: p.position, clicks: p.clicks, impressions: p.impressions,
            path: p.page ? (() => { try { return new URL(p.page).pathname } catch { return p.page } })() : null,
          })),
          inContentMap: cmTargetKws.has(query.toLowerCase()),
        }
      })
      .sort((a, b) => b.totalImpressions - a.totalImpressions)
      .slice(0, 30)

    // Traffic value
    const kwsWithCpc = await prisma.keyword.findMany({ where: { brandId, cpc: { not: null } }, select: { query: true, cpc: true } })
    const cpcMap = new Map(kwsWithCpc.map((k) => [k.query, k.cpc ?? 0]))
    let currentTV = 0, previousTV = 0
    for (const r of currentRankings) currentTV += r.clicks * (cpcMap.get(r.query) ?? 0)
    for (const r of previousRankings) previousTV += r.clicks * (cpcMap.get(r.query) ?? 0)

    // Content & execution
    const publishedPieces: any[] = []
    let contentPublished = 0, contentRanking = 0
    for (const cm of contentMaps) {
      const pieces = cm.mapData ? JSON.parse(cm.mapData) : []
      for (const piece of pieces) {
        if (!piece.published && piece.status !== 'exists') continue
        contentPublished++
        const gsc = currentKwMap.get(piece.targetKeyword?.toLowerCase())
        const prevGsc = previousKwMap.get(piece.targetKeyword?.toLowerCase())
        const daysLive = piece.publishedDate ? Math.floor((Date.now() - new Date(piece.publishedDate).getTime()) / 86400000) : 0
        const status = !gsc ? 'not_ranking' : gsc.position <= 10 ? 'ranking' : gsc.position <= 20 ? 'striking_distance' : 'low'
        if (gsc && gsc.position <= 10) contentRanking++
        publishedPieces.push({
          title: piece.title, targetKeyword: piece.targetKeyword, publishedDate: piece.publishedDate ?? null,
          currentPosition: gsc?.position ?? null, previousPosition: prevGsc?.position ?? null,
          clicks: gsc?.clicks ?? 0, prevClicks: prevGsc?.clicks ?? 0,
          impressions: gsc?.impressions ?? 0, prevImpressions: prevGsc?.impressions ?? 0,
          status, daysLive,
        })
      }
    }

    const aeoStrategy = await prisma.aoeStrategy.findFirst({ where: { brandId }, orderBy: { createdAt: 'desc' } })
    let aeoProgress = { total: 0, done: 0 }
    if (aeoStrategy?.summary) { try { const d = JSON.parse(aeoStrategy.summary); const a = (d.pages ?? []).flatMap((p: any) => p.actions ?? []); aeoProgress = { total: a.length, done: a.filter((x: any) => x.done).length } } catch {} }

    // ── Backfill historical snapshots if not enough data ──
    const existingSnaps = await prisma.performanceSnapshot.count({ where: { brandId } })
    if (existingSnaps <= 1) {
      console.log(`[Performance] Only ${existingSnaps} snapshots — backfilling 12 weeks from GSC history`)
      await backfillSnapshots(brandId, brand.gscProperty!, brand.domain, cpcMap)
    }

    // ── Save this week's snapshot ──
    const monday = getMonday(now)
    const weekOf = fmt(monday)
    const topKwPositions = currentRankings
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 200)
      .map((r) => ({ query: r.query, position: r.position, clicks: r.clicks, impressions: r.impressions, page: r.page }))

    await prisma.performanceSnapshot.upsert({
      where: { brandId_weekOf: { brandId, weekOf } },
      create: {
        brandId, weekOf,
        totalClicks: currentOverview.totalClicks, totalImpressions: currentOverview.totalImpressions,
        avgCtr: currentOverview.avgCtr, avgPosition: currentOverview.avgPosition,
        top3Count: currentDist.top3, top10Count: currentDist.top10, top20Count: currentDist.top20, top50Count: currentDist.top50,
        totalKeywords: currentDist.total, trafficValue: Math.round(currentTV * 100) / 100,
        keywordPositions: JSON.stringify(topKwPositions),
        contentPublished, contentRanking, aeoActionsDone: aeoProgress.done, aeoActionsTotal: aeoProgress.total,
      },
      update: {
        totalClicks: currentOverview.totalClicks, totalImpressions: currentOverview.totalImpressions,
        avgCtr: currentOverview.avgCtr, avgPosition: currentOverview.avgPosition,
        top3Count: currentDist.top3, top10Count: currentDist.top10, top20Count: currentDist.top20, top50Count: currentDist.top50,
        totalKeywords: currentDist.total, trafficValue: Math.round(currentTV * 100) / 100,
        keywordPositions: JSON.stringify(topKwPositions),
        contentPublished, contentRanking, aeoActionsDone: aeoProgress.done, aeoActionsTotal: aeoProgress.total,
      },
    })

    // ── Load all snapshots ──
    const snapshots = await prisma.performanceSnapshot.findMany({
      where: { brandId },
      orderBy: { weekOf: 'asc' },
      take: 52,
    })

    // ── Track target keywords from content map ──
    const targetKeywords: any[] = []
    for (const cm of contentMaps) {
      const pieces = cm.mapData ? JSON.parse(cm.mapData) : []
      for (const piece of pieces) {
        if (!piece.targetKeyword) continue
        const cur = currentKwMap.get(piece.targetKeyword.toLowerCase())
        const prev = previousKwMap.get(piece.targetKeyword.toLowerCase())
        // Find historical positions from snapshots
        const history = snapshots.map((s) => {
          const kwData = JSON.parse(s.keywordPositions).find((k: any) => k.query === piece.targetKeyword?.toLowerCase())
          return { week: s.weekOf, position: kwData?.position ?? null, clicks: kwData?.clicks ?? 0 }
        }).filter((h: any) => h.position !== null)

        targetKeywords.push({
          keyword: piece.targetKeyword,
          title: piece.title,
          status: piece.published ? 'published' : piece.status,
          currentPos: cur?.position ?? null,
          previousPos: prev?.position ?? null,
          change: cur && prev ? prev.position - cur.position : null,
          clicks: cur?.clicks ?? 0,
          impressions: cur?.impressions ?? 0,
          history,
        })
      }
    }
    targetKeywords.sort((a, b) => (b.impressions || 0) - (a.impressions || 0))

    // ── AI Summary ──
    let aiSummary = ''
    try {
      const prevSnap = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null
      const input = {
        period: `${period} days`, currentClicks: currentOverview.totalClicks, previousClicks: previousOverview.totalClicks,
        currentImpressions: currentOverview.totalImpressions, previousImpressions: previousOverview.totalImpressions,
        avgPosition: currentOverview.avgPosition.toFixed(1), prevAvgPosition: previousOverview.avgPosition.toFixed(1),
        top10Now: currentDist.top10, top10Before: previousDist.top10,
        winners: winners.length, losers: losers.length, newKws: newKws.length, lostKws: lostKws.length,
        topWinners: winners.slice(0, 3).map((w: any) => `"${w.query}" (pos ${Math.round(w.previousPos)}→${Math.round(w.currentPos)})`),
        strikingDistance: strikingDistance.length,
        contentPublished, contentRanking,
        weeksTracked: snapshots.length,
        firstWeekClicks: snapshots[0]?.totalClicks ?? null,
        firstWeekTop10: snapshots[0]?.top10Count ?? null,
        trafficValue: currentTV.toFixed(0),
        contentPiecesWorking: publishedPieces.filter((p: any) => p.status === 'ranking').map((p: any) => `"${p.title}" pos ${p.currentPosition?.toFixed(0)}`).slice(0, 3),
        contentPiecesNotRanking: publishedPieces.filter((p: any) => p.status === 'not_ranking' && p.daysLive > 30).length,
      }
      const r = await callClaude<{ summary: string }>({
        system: `You are an SEO expert writing a performance report. Write 3-4 sentences in English covering:
1. Overall trend: traffic growing/declining and by how much
2. What's working: specific content or keywords that improved
3. What needs attention: drops or content not ranking
4. Historical context if available (e.g. "Since we started tracking 8 weeks ago, top 10 keywords grew from X to Y")
Be specific with numbers. Connect actions (content published, optimizations) to results (ranking changes, traffic). No fluff.`,
        prompt: `Data:\n${JSON.stringify(input)}\n\nReturn: { "summary": "..." }`,
        maxTokens: 400,
      })
      aiSummary = r.summary ?? ''
    } catch {
      const cd = currentOverview.totalClicks - previousOverview.totalClicks
      aiSummary = `${period}-day comparison: ${currentOverview.totalClicks.toLocaleString()} clicks (${cd >= 0 ? '+' : ''}${cd.toLocaleString()}). ${winners.length} keywords improved, ${losers.length} dropped. ${contentRanking} of ${contentPublished} published pieces ranking in top 10.`
    }

    // ── AI Insights for movement sections ──
    let workingInsight = '', attentionInsight = ''
    try {
      const insightInput = {
        winners: winners.slice(0, 5).map((w: any) => ({ kw: w.query, from: Math.round(w.previousPos), to: Math.round(w.currentPos), page: w.page, inContentMap: w.inContentMap, clicks: w.clicks })),
        newKws: newKws.slice(0, 5).map((k: any) => ({ kw: k.query, pos: Math.round(k.position), page: k.page, inContentMap: k.inContentMap })),
        losers: losers.slice(0, 5).map((l: any) => ({ kw: l.query, from: Math.round(l.previousPos), to: Math.round(l.currentPos), page: l.page, inContentMap: l.inContentMap })),
        lostKws: lostKws.slice(0, 5).map((k: any) => ({ kw: k.query, page: k.page })),
        strikingDistance: strikingDistance.slice(0, 5).map((s: any) => ({ kw: s.query, pos: Math.round(s.position), impr: s.impressions, page: s.page })),
        brandDomain: brand.domain,
      }
      const insights = await callClaude<{ working: string; attention: string }>({
        system: `You are an SEO expert explaining keyword movement to a non-technical person. Write TWO short insights (1-2 sentences each) in English:
1. "working": Explain WHY the improved keywords are good news. Mention if they moved to page 1. Note if they rank with homepage (/) instead of a dedicated page — that means there's opportunity to rank even higher with dedicated content.
2. "attention": Explain what the drops and striking distance mean practically. What should be done? Be specific and actionable.
Keep it simple — no jargon. Focus on business impact.`,
        prompt: `Data:\n${JSON.stringify(insightInput)}\n\nReturn: { "working": "...", "attention": "..." }`,
        maxTokens: 300,
      })
      workingInsight = insights.working ?? ''
      attentionInsight = insights.attention ?? ''
    } catch {}


    const responseData = {
      period: { days: period, currentStart: fmt(currentStart), currentEnd: fmt(currentEnd), previousStart: fmt(previousStart), previousEnd: fmt(previousEnd) },
      overview: { current: currentOverview, previous: previousOverview, trafficValue: { current: Math.round(currentTV * 100) / 100, previous: Math.round(previousTV * 100) / 100 } },
      distribution: { current: currentDist, previous: previousDist },
      topKwsByRange,
      movement: { winners: winners.slice(0, 25), losers: losers.slice(0, 25), new: newKws.slice(0, 25), lost: lostKws.slice(0, 25) },
      strikingDistance,
      cannibalization,
      contentPerformance: publishedPieces,
      targetKeywords: targetKeywords.slice(0, 30),
      execution: { content: { total: contentMaps.reduce((s, cm) => s + (cm.mapData ? JSON.parse(cm.mapData).length : 0), 0), published: contentPublished }, aeo: aeoProgress },
      snapshots: snapshots.map((s) => ({
        weekOf: s.weekOf, totalClicks: s.totalClicks, totalImpressions: s.totalImpressions,
        avgPosition: s.avgPosition, top10Count: s.top10Count, top3Count: s.top3Count,
        trafficValue: s.trafficValue, contentPublished: s.contentPublished, contentRanking: s.contentRanking,
      })),
      aiSummary,
      workingInsight,
      attentionInsight,
      generatedAt: new Date().toISOString(),
    }

    // Cache for 6 hours
    const cacheKey = `performance:${brandId}:${period}`
    await prisma.apiCache.upsert({
      where: { cacheKey },
      create: { cacheKey, endpoint: 'performance', response: JSON.stringify(responseData), expiresAt: new Date(Date.now() + 6 * 3600000) },
      update: { response: JSON.stringify(responseData), expiresAt: new Date(Date.now() + 6 * 3600000) },
    })

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('[Performance] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 })
  }
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Backfill 12 weeks of historical snapshots from GSC.
 * Each week: Mon-Sun, fetch overview + rankings for that 7-day window.
 */
async function backfillSnapshots(brandId: string, gscProperty: string, domain: string, cpcMap: Map<string, number>) {
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const now = new Date()
  const delay = 3 * 86400000

  // Generate 12 week ranges (oldest first)
  const weeks: Array<{ weekOf: string; start: string; end: string }> = []
  for (let w = 12; w >= 1; w--) {
    const weekEnd = new Date(now.getTime() - delay - (w - 1) * 7 * 86400000)
    const weekStart = new Date(weekEnd.getTime() - 6 * 86400000)
    const monday = getMonday(weekStart)
    weeks.push({ weekOf: fmt(monday), start: fmt(weekStart), end: fmt(weekEnd) })
  }

  // Process each week sequentially (avoid overwhelming GSC API)
  for (const week of weeks) {
    try {
      const [overview, rankings] = await Promise.all([
        fetchOverview(gscProperty, week.start, week.end),
        fetchRankings(gscProperty, { startDate: week.start, endDate: week.end, rowLimit: 2000 }),
      ])

      // Distribution
      const kwBest = new Map<string, number>()
      for (const r of rankings) {
        if (!kwBest.has(r.query) || r.position < kwBest.get(r.query)!) kwBest.set(r.query, r.position)
      }
      const positions = [...kwBest.values()]
      const top3 = positions.filter((p) => p <= 3).length
      const top10 = positions.filter((p) => p <= 10).length
      const top20 = positions.filter((p) => p <= 20).length
      const top50 = positions.filter((p) => p <= 50).length

      // Traffic value
      let tv = 0
      for (const r of rankings) tv += r.clicks * (cpcMap.get(r.query) ?? 0)

      // Top keyword positions
      const topKws = rankings
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 200)
        .map((r) => ({ query: r.query, position: r.position, clicks: r.clicks, impressions: r.impressions, page: r.page }))

      await prisma.performanceSnapshot.upsert({
        where: { brandId_weekOf: { brandId, weekOf: week.weekOf } },
        create: {
          brandId, weekOf: week.weekOf,
          totalClicks: overview.totalClicks, totalImpressions: overview.totalImpressions,
          avgCtr: overview.avgCtr, avgPosition: overview.avgPosition,
          top3Count: top3, top10Count: top10, top20Count: top20, top50Count: top50,
          totalKeywords: positions.length, trafficValue: Math.round(tv * 100) / 100,
          keywordPositions: JSON.stringify(topKws),
          contentPublished: 0, contentRanking: 0, aeoActionsDone: 0, aeoActionsTotal: 0,
        },
        update: {},
      })

      console.log(`[Performance] Backfilled week ${week.weekOf}: ${overview.totalClicks} clicks, ${top10} top10`)
    } catch (err: any) {
      console.error(`[Performance] Backfill failed for ${week.weekOf}:`, err?.message)
    }
  }

  console.log(`[Performance] Backfill complete — ${weeks.length} weeks`)
}
