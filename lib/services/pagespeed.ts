/**
 * Google PageSpeed Insights API v5
 * Free API — key recommended for higher rate limits (25K/day vs 2/100s)
 */

export interface CoreWebVitals {
  lcp: { value: number; category: string } | null   // ms
  inp: { value: number; category: string } | null   // ms
  cls: { value: number; category: string } | null   // unitless (× 100 for display)
  fcp: { value: number; category: string } | null   // ms
  ttfb: { value: number; category: string } | null  // ms
  overallCategory: string | null                      // FAST | AVERAGE | SLOW
}

export interface LighthouseScores {
  performance: number   // 0-100
  seo: number           // 0-100
  accessibility: number // 0-100
  bestPractices: number // 0-100
}

export interface LighthouseMetrics {
  lcp: number    // ms
  cls: number    // unitless
  fcp: number    // ms
  si: number     // Speed Index ms
  tbt: number    // Total Blocking Time ms (lab proxy for INP)
  ttfb: number   // ms
}

export interface PageSpeedOpportunity {
  id: string
  title: string
  description: string
  savingsMs: number
  savingsBytes: number
  score: number | null
  items: Array<{ url?: string; wastedMs?: number; wastedBytes?: number }>
}

export interface PageSpeedDiagnostic {
  id: string
  title: string
  description: string
  displayValue: string | null
  score: number | null
}

export interface PageSpeedResult {
  url: string
  strategy: 'mobile' | 'desktop'
  fetchedAt: string
  // Field data (CrUX) — null if not enough traffic
  fieldData: CoreWebVitals
  // Lab data (Lighthouse)
  scores: LighthouseScores
  metrics: LighthouseMetrics
  // Suggestions
  opportunities: PageSpeedOpportunity[]
  diagnostics: PageSpeedDiagnostic[]
}

const API_KEY = process.env.PAGESPEED_API_KEY ?? ''
const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export async function analyzePageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
): Promise<PageSpeedResult> {
  const params = new URLSearchParams({
    url,
    strategy,
    ...(API_KEY ? { key: API_KEY } : {}),
  })
  // Multiple categories
  const fullUrl = `${ENDPOINT}?${params.toString()}&category=performance&category=seo&category=accessibility&category=best-practices`

  console.log(`[PageSpeed] Analyzing: ${url} (${strategy})`)
  const res = await fetch(fullUrl, { signal: AbortSignal.timeout(90_000) })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    const msg = `PageSpeed API error ${res.status}: ${err.slice(0, 300)}`
    console.error(`[PageSpeed] ${msg}`)
    throw new Error(msg)
  }

  const data = await res.json()

  // Extract field data (CrUX)
  const le = data.loadingExperience?.metrics ?? {}
  const fieldData: CoreWebVitals = {
    lcp: le.LARGEST_CONTENTFUL_PAINT_MS ? { value: le.LARGEST_CONTENTFUL_PAINT_MS.percentile, category: le.LARGEST_CONTENTFUL_PAINT_MS.category } : null,
    inp: le.INTERACTION_TO_NEXT_PAINT ? { value: le.INTERACTION_TO_NEXT_PAINT.percentile, category: le.INTERACTION_TO_NEXT_PAINT.category } : null,
    cls: le.CUMULATIVE_LAYOUT_SHIFT_SCORE ? { value: le.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100, category: le.CUMULATIVE_LAYOUT_SHIFT_SCORE.category } : null,
    fcp: le.FIRST_CONTENTFUL_PAINT_MS ? { value: le.FIRST_CONTENTFUL_PAINT_MS.percentile, category: le.FIRST_CONTENTFUL_PAINT_MS.category } : null,
    ttfb: le.EXPERIMENTAL_TIME_TO_FIRST_BYTE ? { value: le.EXPERIMENTAL_TIME_TO_FIRST_BYTE.percentile, category: le.EXPERIMENTAL_TIME_TO_FIRST_BYTE.category } : null,
    overallCategory: data.loadingExperience?.overall_category ?? null,
  }

  // Extract Lighthouse scores
  const cats = data.lighthouseResult?.categories ?? {}
  const scores: LighthouseScores = {
    performance: Math.round((cats.performance?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
  }

  // Extract lab metrics
  const audits = data.lighthouseResult?.audits ?? {}
  const metrics: LighthouseMetrics = {
    lcp: audits['largest-contentful-paint']?.numericValue ?? 0,
    cls: audits['cumulative-layout-shift']?.numericValue ?? 0,
    fcp: audits['first-contentful-paint']?.numericValue ?? 0,
    si: audits['speed-index']?.numericValue ?? 0,
    tbt: audits['total-blocking-time']?.numericValue ?? 0,
    ttfb: audits['server-response-time']?.numericValue ?? 0,
  }

  // Extract opportunities (sorted by savings)
  const opportunityIds = [
    'render-blocking-resources', 'unused-css-rules', 'unused-javascript',
    'modern-image-formats', 'efficiently-encode-images', 'uses-text-compression',
    'uses-responsive-images', 'offscreen-images', 'redirects', 'uses-long-cache-ttl',
    'largest-contentful-paint-element', 'total-byte-weight', 'dom-size',
    'third-party-summary', 'mainthread-work-breakdown',
  ]
  const opportunities: PageSpeedOpportunity[] = opportunityIds
    .map((id) => {
      const a = audits[id]
      if (!a || a.score === 1 || a.score === null) return null
      const savingsMs = a.details?.overallSavingsMs ?? a.numericValue ?? 0
      const savingsBytes = a.details?.overallSavingsBytes ?? 0
      if (savingsMs === 0 && savingsBytes === 0 && a.score >= 0.9) return null
      return {
        id,
        title: a.title ?? id,
        description: (a.description ?? '').replace(/\[.*?\]\(.*?\)/g, '').trim(),
        savingsMs: Math.round(savingsMs),
        savingsBytes: Math.round(savingsBytes),
        score: a.score,
        items: (a.details?.items ?? []).slice(0, 5).map((item: any) => ({
          url: item.url ?? item.source?.url,
          wastedMs: item.wastedMs ? Math.round(item.wastedMs) : undefined,
          wastedBytes: item.wastedBytes ? Math.round(item.wastedBytes) : undefined,
        })),
      }
    })
    .filter((o): o is PageSpeedOpportunity => o !== null)
    .sort((a, b) => b.savingsMs - a.savingsMs)

  // Extract diagnostics
  const diagIds = [
    'dom-size', 'mainthread-work-breakdown', 'bootup-time',
    'font-display', 'third-party-summary', 'largest-contentful-paint-element',
    'layout-shift-elements', 'long-tasks', 'non-composited-animations',
  ]
  const diagnostics: PageSpeedDiagnostic[] = diagIds
    .map((id) => {
      const a = audits[id]
      if (!a || a.score === 1) return null
      return {
        id,
        title: a.title ?? id,
        description: (a.description ?? '').replace(/\[.*?\]\(.*?\)/g, '').trim(),
        displayValue: a.displayValue ?? null,
        score: a.score,
      }
    })
    .filter((d): d is PageSpeedDiagnostic => d !== null)

  return {
    url,
    strategy,
    fetchedAt: new Date().toISOString(),
    fieldData,
    scores,
    metrics,
    opportunities,
    diagnostics,
  }
}

/**
 * Analyze multiple URLs with concurrency control
 */
export async function batchAnalyzePageSpeed(
  urls: string[],
  strategy: 'mobile' | 'desktop' = 'mobile',
  concurrency = 1, // default 1 to avoid rate limits without API key
  onProgress?: (done: number, total: number) => void
): Promise<PageSpeedResult[]> {
  const hasKey = !!process.env.PAGESPEED_API_KEY
  const actualConcurrency = hasKey ? Math.min(concurrency, 3) : 1
  const delayMs = hasKey ? 1000 : 3000 // 3s between requests without key

  const results: PageSpeedResult[] = []
  const errors: string[] = []
  let done = 0

  // Process sequentially to respect rate limits
  for (const url of urls) {
    try {
      const result = await analyzePageSpeed(url, strategy)
      results.push(result)
    } catch (err: any) {
      const msg = err?.message ?? String(err)
      console.error(`[PageSpeed] Failed for ${url}: ${msg}`)
      errors.push(`${new URL(url).pathname}: ${msg.slice(0, 100)}`)

      // If rate limited, wait longer
      if (msg.includes('429')) {
        console.log('[PageSpeed] Rate limited, waiting 10s...')
        await new Promise((r) => setTimeout(r, 10000))
      }
    }
    done++
    onProgress?.(done, urls.length)

    // Delay between requests
    if (done < urls.length) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(`All PageSpeed requests failed. First error: ${errors[0]}${!hasKey ? '\n\nTip: Add PAGESPEED_API_KEY to .env for higher rate limits (free from Google Cloud Console).' : ''}`)
  }

  console.log(`[PageSpeed] Done: ${results.length} success, ${errors.length} failed`)
  return results
}
