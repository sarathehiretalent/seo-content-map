import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google-auth'

export interface GscRanking {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  page?: string
}

export interface GscOverview {
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
  totalPages: number
  dateRange: { start: string; end: string }
}

export async function fetchRankings(
  siteUrl: string,
  options?: { startDate?: string; endDate?: string; rowLimit?: number }
): Promise<GscRanking[]> {
  const auth = await getAuthenticatedClient()
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const now = new Date()
  const endDate = options?.endDate ?? new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0]
  const startDate = options?.startDate ?? new Date(now.getTime() - 93 * 86400000).toISOString().split('T')[0]

  const allRows: GscRanking[] = []
  let startRow = 0
  const rowLimit = options?.rowLimit ?? 500

  while (allRows.length < rowLimit) {
    const batchSize = Math.min(25000, rowLimit - allRows.length)
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query', 'page'],
        rowLimit: batchSize,
        startRow,
      },
    })

    const rows = response.data.rows
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      allRows.push({
        query: row.keys![0],
        page: row.keys![1],
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      })
    }

    if (rows.length < batchSize) break
    startRow += rows.length
  }

  return allRows.slice(0, rowLimit)
}

/**
 * Fetches overview metrics from GSC for a date range.
 */
export async function fetchOverview(
  siteUrl: string,
  startDate?: string,
  endDate?: string
): Promise<GscOverview> {
  const auth = await getAuthenticatedClient()
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const now = new Date()
  const end = endDate ?? new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0]
  const start = startDate ?? new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0]

  // Global metrics (no dimensions = totals)
  const totals = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: start, endDate: end },
  })

  const row = totals.data.rows?.[0]

  // Count unique pages
  const pagesResp = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: start,
      endDate: end,
      dimensions: ['page'],
      rowLimit: 5000,
    },
  })

  return {
    totalClicks: row?.clicks ?? 0,
    totalImpressions: row?.impressions ?? 0,
    avgCtr: row?.ctr ?? 0,
    avgPosition: row?.position ?? 0,
    totalPages: pagesResp.data.rows?.length ?? 0,
    dateRange: { start, end },
  }
}

export async function listGscProperties(): Promise<string[]> {
  const auth = await getAuthenticatedClient()
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const response = await searchconsole.sites.list()
  return (response.data.siteEntry ?? [])
    .map((site) => site.siteUrl!)
    .filter(Boolean)
}
