import { getKeywordMetrics } from '@/lib/services/dataforseo'
import type { DiscoveredTopic } from './topic-discovery'

/**
 * Keyword Research Agent
 * Validates topic suggestions with REAL DataForSEO data.
 * Discards topics with no search volume.
 * Selects the best keyword per topic.
 */

export interface ValidatedTopic extends DiscoveredTopic {
  targetKeyword: string
  volume: number | null
  kd: number | null
  cpc: number | null
  secondaryKeywords: Array<{ keyword: string; volume: number | null }>
}

export async function runKeywordResearch(topics: DiscoveredTopic[]): Promise<ValidatedTopic[]> {
  console.log(`[KeywordResearch] Validating ${topics.length} topics with DataForSEO...`)

  // Collect all suggested keywords
  const allKeywords: string[] = []
  topics.forEach((t) => {
    t.suggestedKeywords.forEach((kw) => {
      if (!allKeywords.includes(kw.toLowerCase())) allKeywords.push(kw.toLowerCase())
    })
  })

  console.log(`[KeywordResearch] Checking ${allKeywords.length} unique keywords`)

  // Fetch metrics from DataForSEO
  const metrics = await getKeywordMetrics(allKeywords)
  const metricsMap = new Map(metrics.map((m) => [m.keyword.toLowerCase(), m]))

  // Validate each topic — pick best keyword by volume
  const validated: ValidatedTopic[] = []
  let discarded = 0

  for (const topic of topics) {
    const kwMetrics = topic.suggestedKeywords
      .map((kw) => {
        const m = metricsMap.get(kw.toLowerCase())
        return { keyword: kw, volume: m?.searchVolume ?? null, kd: m?.kd ?? null, cpc: m?.cpc ?? null }
      })
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))

    const best = kwMetrics[0]

    // Only keep topics with REAL search volume > 0
    // Exception: BOFU keywords with volume >= 10 (low volume but high purchase intent)
    const minVolume = topic.funnelStage === 'bofu' ? 10 : 20
    if (best && best.volume != null && best.volume >= minVolume) {
      validated.push({
        ...topic,
        targetKeyword: best.keyword,
        volume: best.volume,
        kd: best.kd,
        cpc: best.cpc,
        secondaryKeywords: kwMetrics.slice(1).filter((k) => k.volume != null && k.volume > 0).map((k) => ({ keyword: k.keyword, volume: k.volume })),
      })
    } else {
      discarded++
      console.log(`[KeywordResearch] Discarded: "${topic.topic}" — best keyword "${best?.keyword}" vol:${best?.volume}`)
    }
  }

  console.log(`[KeywordResearch] Validated: ${validated.length}, Discarded (no volume): ${discarded}`)
  return validated
}
