/**
 * Deep web research for brand intelligence.
 * Uses Google search via DataForSEO to find and validate competitors.
 */

import { getCached, setCache, makeCacheKey } from './cache'

const BASE_URL = 'https://api.dataforseo.com/v3'

function getAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) throw new Error('DataForSEO credentials not configured')
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

export interface SearchResult {
  title: string
  url: string
  domain: string
  description: string
}

/**
 * Performs a Google search via DataForSEO and returns organic results.
 */
export async function googleSearch(query: string, limit = 10): Promise<SearchResult[]> {
  const cacheKey = makeCacheKey('web:search', { query })
  const cached = await getCached<SearchResult[]>(cacheKey)
  if (cached) return cached

  console.log(`[WebResearch] Searching: "${query}"`)

  const response = await fetch(`${BASE_URL}/serp/google/organic/live/regular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    body: JSON.stringify([{
      keyword: query,
      location_code: 2840,
      language_code: 'en',
      device: 'desktop',
      depth: limit,
    }]),
  })

  if (!response.ok) throw new Error(`Search failed: ${response.status}`)
  const data = await response.json()

  const items = data.tasks?.[0]?.result?.[0]?.items ?? []
  const results: SearchResult[] = items
    .filter((i: { type: string }) => i.type === 'organic')
    .map((i: { title: string; url: string; description: string }) => {
      let domain = ''
      try { domain = new URL(i.url).hostname.replace('www.', '') } catch { domain = i.url }
      return { title: i.title, url: i.url, domain, description: i.description ?? '' }
    })

  await setCache(cacheKey, 'web:search', results, 7)
  return results
}

/**
 * Scrapes a page and extracts key info for competitor analysis.
 */
export async function fetchPageInfo(url: string): Promise<{ title: string; description: string; h1: string } | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return null
    const html = await response.text()
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
    const meta = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim() ?? ''
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
    return { title, description: meta, h1 }
  } catch {
    return null
  }
}
