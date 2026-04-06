import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google-auth'
import { fetchRankings, fetchOverview, type GscRanking } from '@/lib/services/gsc'

/**
 * GET /api/performance?brandId=...&period=28&compare=previous
 *
 * Returns two periods of GSC data for comparison:
 * - Current period (last N days)
 * - Previous period (N days before that)
 * Plus: keyword movement, content performance, trend data
 */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')
  const period = parseInt(request.nextUrl.searchParams.get('period') ?? '28')

  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  if (!brand.gscProperty) {
    return NextResponse.json({ error: 'GSC not connected' }, { status: 400 })
  }

  try {
    const now = new Date()
    const delay = 3 * 86400000 // GSC has 3-day delay

    // Current period
    const currentEnd = new Date(now.getTime() - delay)
    const currentStart = new Date(currentEnd.getTime() - period * 86400000)

    // Previous period (same length, right before current)
    const previousEnd = new Date(currentStart.getTime() - 86400000)
    const previousStart = new Date(previousEnd.getTime() - period * 86400000)

    const fmt = (d: Date) => d.toISOString().split('T')[0]

    // Fetch both periods in parallel + daily trend
    // Use allSettled so partial failures don't kill everything
    const emptyOverview = { totalClicks: 0, totalImpressions: 0, avgCtr: 0, avgPosition: 0, totalPages: 0, dateRange: { start: '', end: '' } }
    const results = await Promise.allSettled([
      fetchOverview(brand.gscProperty!, fmt(currentStart), fmt(currentEnd)),
      fetchOverview(brand.gscProperty!, fmt(previousStart), fmt(previousEnd)),
      fetchRankings(brand.gscProperty!, { startDate: fmt(currentStart), endDate: fmt(currentEnd), rowLimit: 5000 }),
      fetchRankings(brand.gscProperty!, { startDate: fmt(previousStart), endDate: fmt(previousEnd), rowLimit: 5000 }),
      fetchDailyTrend(brand.gscProperty!, fmt(new Date(now.getTime() - delay - 90 * 86400000)), fmt(currentEnd)),
    ])

    const currentOverview = results[0].status === 'fulfilled' ? results[0].value : emptyOverview
    const previousOverview = results[1].status === 'fulfilled' ? results[1].value : emptyOverview
    const currentRankings = results[2].status === 'fulfilled' ? results[2].value : []
    const previousRankings = results[3].status === 'fulfilled' ? results[3].value : []
    const trendData = results[4].status === 'fulfilled' ? results[4].value : []

    // Log any failures
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[Performance] Query ${i} failed:`, r.reason?.message ?? r.reason)
    })

    // Build keyword maps for comparison
    const currentKwMap = new Map<string, GscRanking>()
    for (const kw of currentRankings) currentKwMap.set(kw.query, kw)
    const previousKwMap = new Map<string, GscRanking>()
    for (const kw of previousRankings) previousKwMap.set(kw.query, kw)

    // Keyword movement analysis
    const winners: Array<{ query: string; page?: string; currentPos: number; previousPos: number; change: number; clicks: number; impressions: number }> = []
    const losers: Array<typeof winners[0]> = []
    const newKws: Array<{ query: string; page?: string; position: number; clicks: number; impressions: number }> = []
    const lostKws: Array<typeof newKws[0]> = []

    for (const [query, current] of currentKwMap) {
      const prev = previousKwMap.get(query)
      if (prev) {
        const change = prev.position - current.position // positive = improved
        if (change >= 3) winners.push({ query, page: current.page, currentPos: current.position, previousPos: prev.position, change, clicks: current.clicks, impressions: current.impressions })
        else if (change <= -3) losers.push({ query, page: current.page, currentPos: current.position, previousPos: prev.position, change, clicks: current.clicks, impressions: current.impressions })
      } else {
        newKws.push({ query, page: current.page, position: current.position, clicks: current.clicks, impressions: current.impressions })
      }
    }
    for (const [query, prev] of previousKwMap) {
      if (!currentKwMap.has(query)) {
        lostKws.push({ query, page: prev.page, position: prev.position, clicks: prev.clicks, impressions: prev.impressions })
      }
    }

    // Sort
    winners.sort((a, b) => b.change - a.change)
    losers.sort((a, b) => a.change - b.change)
    newKws.sort((a, b) => b.impressions - a.impressions)
    lostKws.sort((a, b) => b.impressions - a.impressions)

    // Ranking distribution
    const distribution = (rankings: GscRanking[]) => {
      const uniqueKws = new Map<string, number>()
      for (const r of rankings) {
        if (!uniqueKws.has(r.query) || r.position < uniqueKws.get(r.query)!) {
          uniqueKws.set(r.query, r.position)
        }
      }
      const positions = [...uniqueKws.values()]
      return {
        top3: positions.filter((p) => p <= 3).length,
        top10: positions.filter((p) => p <= 10).length,
        top20: positions.filter((p) => p <= 20).length,
        top50: positions.filter((p) => p <= 50).length,
        total: positions.length,
      }
    }

    const currentDist = distribution(currentRankings)
    const previousDist = distribution(previousRankings)

    // Striking distance (pos 11-20, high impressions)
    const strikingDistance = currentRankings
      .filter((r) => r.position >= 11 && r.position <= 20 && r.impressions >= 50)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20)
      .map((r) => ({ query: r.query, page: r.page, position: r.position, impressions: r.impressions, clicks: r.clicks }))

    // Traffic value estimate (clicks × CPC from DataForSEO)
    const kwsWithCpc = await prisma.keyword.findMany({
      where: { brandId, cpc: { not: null } },
      select: { query: true, cpc: true },
    })
    const cpcMap = new Map(kwsWithCpc.map((k) => [k.query, k.cpc ?? 0]))
    let currentTrafficValue = 0
    let previousTrafficValue = 0
    for (const r of currentRankings) currentTrafficValue += r.clicks * (cpcMap.get(r.query) ?? 0)
    for (const r of previousRankings) previousTrafficValue += r.clicks * (cpcMap.get(r.query) ?? 0)

    // Content performance — match published content map pieces with GSC data
    const contentMaps = await prisma.contentMap.findMany({
      where: { brandId, status: 'completed' },
      select: { mapData: true },
    })
    const publishedPieces: Array<{
      title: string; targetKeyword: string; publishedDate: string | null
      currentPosition: number | null; clicks: number; impressions: number; ctr: number
      status: string; daysLive: number
    }> = []

    for (const cm of contentMaps) {
      const pieces = cm.mapData ? JSON.parse(cm.mapData) : []
      for (const piece of pieces) {
        if (!piece.published && piece.status !== 'exists') continue
        const gscData = currentKwMap.get(piece.targetKeyword?.toLowerCase())
        const daysLive = piece.publishedDate ? Math.floor((Date.now() - new Date(piece.publishedDate).getTime()) / 86400000) : 0
        publishedPieces.push({
          title: piece.title,
          targetKeyword: piece.targetKeyword,
          publishedDate: piece.publishedDate ?? null,
          currentPosition: gscData?.position ?? null,
          clicks: gscData?.clicks ?? 0,
          impressions: gscData?.impressions ?? 0,
          ctr: gscData?.ctr ?? 0,
          status: !gscData ? 'not_ranking' : gscData.position <= 10 ? 'ranking' : gscData.position <= 20 ? 'striking_distance' : 'low',
          daysLive,
        })
      }
    }

    // Execution progress
    const aeoStrategy = await prisma.aoeStrategy.findFirst({ where: { brandId }, orderBy: { createdAt: 'desc' } })
    let aeoProgress = { total: 0, done: 0 }
    if (aeoStrategy?.summary) {
      try {
        const aeoData = JSON.parse(aeoStrategy.summary)
        const allActions = (aeoData.pages ?? []).flatMap((p: any) => p.actions ?? [])
        aeoProgress = { total: allActions.length, done: allActions.filter((a: any) => a.done).length }
      } catch {}
    }

    let contentProgress = { total: 0, published: 0 }
    for (const cm of contentMaps) {
      const pieces = cm.mapData ? JSON.parse(cm.mapData) : []
      contentProgress.total += pieces.length
      contentProgress.published += pieces.filter((p: any) => p.published || p.status === 'exists').length
    }

    return NextResponse.json({
      period: { days: period, currentStart: fmt(currentStart), currentEnd: fmt(currentEnd), previousStart: fmt(previousStart), previousEnd: fmt(previousEnd) },
      overview: {
        current: currentOverview,
        previous: previousOverview,
        trafficValue: { current: Math.round(currentTrafficValue * 100) / 100, previous: Math.round(previousTrafficValue * 100) / 100 },
      },
      distribution: { current: currentDist, previous: previousDist },
      movement: {
        winners: winners.slice(0, 20),
        losers: losers.slice(0, 20),
        new: newKws.slice(0, 20),
        lost: lostKws.slice(0, 20),
      },
      strikingDistance,
      contentPerformance: publishedPieces,
      execution: { content: contentProgress, aeo: aeoProgress },
      trend: trendData,
    })
  } catch (error) {
    console.error('[Performance] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch performance data' }, { status: 500 })
  }
}

/** Fetch daily clicks/impressions for trend chart */
async function fetchDailyTrend(siteUrl: string, startDate: string, endDate: string) {
  const auth = await getAuthenticatedClient()
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 25000,
    },
  })

  return (response.data.rows ?? []).map((row) => ({
    date: row.keys![0],
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}
