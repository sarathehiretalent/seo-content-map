import { getCached, setCache, makeCacheKey } from './cache'

const BASE_URL = 'https://api.dataforseo.com/v3'

function getAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN
  const password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password) throw new Error('DataForSEO credentials not configured')
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64')
}

async function dfsFetch<T>(endpoint: string, body: unknown): Promise<T> {
  console.log(`[DataForSEO] POST ${endpoint}`)
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(`[DataForSEO] Error ${response.status}: ${text.substring(0, 500)}`)
    throw new Error(`DataForSEO error ${response.status}: ${text.substring(0, 200)}`)
  }

  const data = await response.json() as T
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (data as any)?.tasks ?? []
  const statusCode = tasks[0]?.status_code
  if (statusCode && statusCode !== 20000) {
    console.error(`[DataForSEO] Task error: ${tasks[0]?.status_message}`)
  } else {
    console.log(`[DataForSEO] Success: ${tasks.length} tasks returned`)
  }
  return data
}

// ─── Keyword Metrics (Volume, KD, CPC, Competition) ────────

export interface KeywordMetrics {
  keyword: string
  searchVolume: number | null
  kd: number | null
  cpc: number | null
  competition: number | null
  competitionLevel: string | null
}

export async function getKeywordMetrics(
  keywords: string[],
  locationCode = 2840,
  languageCode = 'en'
): Promise<KeywordMetrics[]> {
  const results: KeywordMetrics[] = []

  for (let i = 0; i < keywords.length; i += 100) {
    const batch = keywords.slice(i, i + 100)

    // Check cache
    const uncached: string[] = []
    for (const kw of batch) {
      const cacheKey = makeCacheKey('dfs:metrics_v2', { keyword: kw, locationCode })
      const cached = await getCached<KeywordMetrics>(cacheKey)
      if (cached && cached.kd != null) {
        results.push(cached)
      } else {
        uncached.push(kw)
      }
    }

    if (uncached.length === 0) continue

    // Step 1: Get Volume, CPC, Competition from search_volume endpoint
    const volMap: Record<string, { searchVolume: number | null; cpc: number | null; competition: number | null; competitionLevel: string | null }> = {}
    try {
      const volData = await dfsFetch<DfsResponse>('/keywords_data/google/search_volume/live', [
        { keywords: uncached, location_code: locationCode, language_code: languageCode },
      ])
      for (const task of volData?.tasks ?? []) {
        for (const r of task.result ?? []) {
          if (r.keyword) {
            volMap[r.keyword] = {
              searchVolume: r.search_volume ?? null,
              cpc: r.cpc ?? null,
              competition: r.competition ?? null,
              competitionLevel: r.competition_level ?? null,
            }
          }
        }
      }
    } catch (err) {
      console.error('[DataForSEO] search_volume failed:', err instanceof Error ? err.message : err)
    }

    // Step 2: Get KD from bulk_keyword_difficulty endpoint
    const kdMap: Record<string, number> = {}
    try {
      const kdData = await dfsFetch<DfsResponse>('/dataforseo_labs/google/bulk_keyword_difficulty/live', [
        { keywords: uncached, location_code: locationCode, language_code: languageCode },
      ])
      for (const task of kdData?.tasks ?? []) {
        const items = task.result?.[0]?.items ?? []
        for (const item of items) {
          if (item.keyword && item.keyword_difficulty != null) {
            kdMap[item.keyword] = item.keyword_difficulty
          }
        }
      }
    } catch (err) {
      console.error('[DataForSEO] bulk_keyword_difficulty failed:', err instanceof Error ? err.message : err)
    }

    // Combine both sources
    for (const kw of uncached) {
      const vol = volMap[kw]
      const metrics: KeywordMetrics = {
        keyword: kw,
        searchVolume: vol?.searchVolume ?? null,
        kd: kdMap[kw] ?? null,
        cpc: vol?.cpc ?? null,
        competition: vol?.competition ?? null,
        competitionLevel: vol?.competitionLevel ?? null,
      }
      results.push(metrics)

      // Only cache if we got actual data
      if (metrics.searchVolume != null || metrics.kd != null) {
        const cacheKey = makeCacheKey('dfs:metrics_v2', { keyword: kw, locationCode })
        await setCache(cacheKey, 'dfs:metrics_v2', metrics, 7)
      }
    }

    if (i + 100 < keywords.length) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  return results
}

// ─── Keyword Suggestions ────────────────────

export interface KeywordSuggestion {
  keyword: string
  searchVolume: number | null
  kd: number | null
  cpc: number | null
  competition: number | null
}

export async function getKeywordSuggestions(
  seedKeywords: string[],
  locationCode = 2840,
  languageCode = 'en',
  limit = 200
): Promise<KeywordSuggestion[]> {
  const cacheKey = makeCacheKey('dfs:suggestions', {
    seeds: seedKeywords.slice(0, 10).sort(),
    locationCode,
  })
  const cached = await getCached<KeywordSuggestion[]>(cacheKey)
  if (cached) return cached

  const data = await dfsFetch<DfsResponse>('/keywords_data/google/keyword_suggestions/live', [
    {
      keywords: seedKeywords.slice(0, 20),
      location_code: locationCode,
      language_code: languageCode,
      limit,
    },
  ])

  const results: KeywordSuggestion[] = []
  for (const task of data?.tasks ?? []) {
    for (const result of task.result ?? []) {
      results.push({
        keyword: result.keyword,
        searchVolume: result.search_volume ?? null,
        kd: result.keyword_difficulty ?? null,
        cpc: result.cpc ?? null,
        competition: result.competition ?? null,
      })
    }
  }

  await setCache(cacheKey, 'dfs:suggestions', results, 7)
  return results
}

// ─── SERP Analysis ──────────────────────────

export interface SerpAnalysisResult {
  keyword: string
  items: SerpItem[]
}

export interface SerpItem {
  type: string
  position?: number
  title?: string
  url?: string
  description?: string
  items?: Array<{ question?: string; answer?: string; title?: string }>
}

export async function getSerpAnalysis(
  keywords: string[],
  locationCode = 2840,
  languageCode = 'en'
): Promise<SerpAnalysisResult[]> {
  const results: SerpAnalysisResult[] = []

  // Process in small batches (5 at a time) to avoid DataForSEO dropping results
  for (let i = 0; i < keywords.length; i += 5) {
    const batch = keywords.slice(i, i + 5)

    const uncached: string[] = []
    for (const kw of batch) {
      const cacheKey = makeCacheKey('dfs:serp', { keyword: kw, locationCode })
      const cached = await getCached<SerpAnalysisResult>(cacheKey)
      if (cached && cached.items && cached.items.length > 0) {
        results.push(cached)
      } else {
        uncached.push(kw)
      }
    }

    if (uncached.length === 0) continue

    const tasks = uncached.map((kw) => ({
      keyword: kw,
      location_code: locationCode,
      language_code: languageCode,
      device: 'desktop',
      os: 'windows',
    }))

    const data = await dfsFetch<DfsResponse>(
      '/serp/google/organic/live/advanced',
      tasks
    )

    for (const task of data?.tasks ?? []) {
      const keyword = task.data?.keyword ?? ''
      const rawItems = task.result?.[0]?.items ?? []
      const items: SerpItem[] = rawItems.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => ({
          type: item.type,
          position: item.rank_absolute ?? item.rank_group,
          title: item.title,
          url: item.url,
          description: item.description,
          items: item.items,
        })
      )

      const serpResult: SerpAnalysisResult = { keyword, items }
      results.push(serpResult)

      // Only cache if we got actual items (don't poison cache with empty results)
      if (items.length > 0) {
        const cacheKey = makeCacheKey('dfs:serp', { keyword, locationCode })
        await setCache(cacheKey, 'dfs:serp', serpResult, 3)
      }
    }

    // Rate limit between SERP batches
    if (i + 5 < keywords.length && uncached.length > 0) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  return results
}

// ─── Keywords for Domain (without GSC) ──────

export interface DomainKeyword {
  keyword: string
  searchVolume: number | null
  kd: number | null
  cpc: number | null
  competition: number | null
  competitionLevel: string | null
  position: number | null
  pageUrl: string | null
  pageTitle: string | null
  serpFeatures: string[]
  intent: string | null
}

export async function getKeywordsForDomain(
  domain: string,
  locationCode = 2840,
  languageCode = 'en',
  limit = 300
): Promise<DomainKeyword[]> {
  const cacheKey = makeCacheKey('dfs:domain_keywords_v3', { domain, locationCode, limit })
  const cached = await getCached<DomainKeyword[]>(cacheKey)
  if (cached) return cached

  console.log(`[DataForSEO] Fetching ranked keywords for domain: ${domain}`)

  const data = await dfsFetch<DfsResponse>('/dataforseo_labs/google/ranked_keywords/live', [
    {
      target: domain,
      location_code: locationCode,
      language_code: languageCode,
      limit,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
      filters: ['keyword_data.keyword_info.search_volume', '>', 0],
    },
  ])

  const results: DomainKeyword[] = []
  for (const task of data?.tasks ?? []) {
    for (const item of task.result?.[0]?.items ?? []) {
      const kwData = item.keyword_data
      const kwInfo = kwData?.keyword_info
      const kwProps = kwData?.keyword_properties
      const serpItem = item.ranked_serp_element?.serp_item
      const serpInfo = kwData?.serp_info

      // Only include if the domain actually has a ranking URL
      const url = serpItem?.url ?? null
      if (!url) continue

      results.push({
        keyword: kwData?.keyword ?? '',
        searchVolume: kwInfo?.search_volume ?? null,
        kd: kwProps?.keyword_difficulty ?? null,
        cpc: kwInfo?.cpc ?? null,
        competition: kwInfo?.competition ?? null,
        competitionLevel: kwInfo?.competition_level?.toLowerCase() ?? null,
        position: serpItem?.rank_absolute ?? null,
        pageUrl: url,
        pageTitle: serpItem?.title ?? null,
        serpFeatures: serpInfo?.serp_item_types ?? [],
        intent: kwData?.search_intent_info?.main_intent ?? null,
      })
    }
  }

  console.log(`[DataForSEO] Found ${results.length} ranked keywords with URLs for ${domain}`)
  await setCache(cacheKey, 'dfs:domain_keywords_v3', results, 7)
  return results
}

// ─── Keyword Ideas based on seed ────────────

export async function getKeywordIdeas(
  seedKeywords: string[],
  locationCode = 2840,
  languageCode = 'en',
  limit = 200
): Promise<KeywordSuggestion[]> {
  const cacheKey = makeCacheKey('dfs:keyword_ideas', {
    seeds: seedKeywords.slice(0, 5).sort(),
    locationCode,
  })
  const cached = await getCached<KeywordSuggestion[]>(cacheKey)
  if (cached) return cached

  console.log(`[DataForSEO] Getting keyword ideas for: ${seedKeywords.slice(0, 5).join(', ')}`)

  const data = await dfsFetch<DfsResponse>('/dataforseo_labs/google/keyword_ideas/live', [
    {
      keywords: seedKeywords.slice(0, 20),
      location_code: locationCode,
      language_code: languageCode,
      limit,
      order_by: ['keyword_info.search_volume,desc'],
    },
  ])

  const results: KeywordSuggestion[] = []
  for (const task of data?.tasks ?? []) {
    for (const item of task.result?.[0]?.items ?? []) {
      results.push({
        keyword: item.keyword ?? '',
        searchVolume: item.keyword_info?.search_volume ?? null,
        kd: item.keyword_info?.keyword_difficulty ?? null,
        cpc: item.keyword_info?.cpc ?? null,
        competition: item.keyword_info?.competition ?? null,
      })
    }
  }

  console.log(`[DataForSEO] Got ${results.length} keyword ideas`)
  await setCache(cacheKey, 'dfs:keyword_ideas', results, 7)
  return results
}

// ─── Types ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DfsResponse {
  tasks?: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any
  }>
}
