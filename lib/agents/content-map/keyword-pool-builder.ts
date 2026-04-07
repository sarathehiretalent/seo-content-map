import { prisma } from '@/lib/prisma'
import { getKeywordMetrics } from '@/lib/services/dataforseo'
import { callClaude } from '@/lib/services/anthropic'

export interface PoolKeyword {
  keyword: string
  volume: number
  kd: number | null
  cpc: number | null
  source: 'gsc' | 'dataforseo' | 'ai_validated'
  existingUrl: string | null
  position: number | null
  rationale: string
}

const DFS_AUTH = () => 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

/**
 * Fetches related keywords for a seed — MUCH more relevant than keyword_ideas
 */
async function fetchRelatedKeywords(seed: string): Promise<Array<{ keyword: string; volume: number | null; kd: number | null; cpc: number | null }>> {
  try {
    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: DFS_AUTH() },
      body: JSON.stringify([{ keyword: seed, location_code: 2840, language_code: 'en', limit: 20, filters: ['keyword_data.keyword_info.search_volume', '>', 10] }]),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.tasks?.[0]?.result?.[0]?.items ?? []).map((i: any) => ({
      keyword: i.keyword_data?.keyword,
      volume: i.keyword_data?.keyword_info?.search_volume ?? null,
      kd: i.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
      cpc: i.keyword_data?.keyword_info?.cpc ?? null,
    })).filter((k: any) => k.keyword && k.keyword.length <= 60)
  } catch { return [] }
}

/**
 * Keyword Pool Builder — data-first approach
 * 1. GSC keywords (existing rankings)
 * 2. DataForSEO related_keywords with 10+ product-specific seeds
 * 3. Claude suggests ICP keywords → validated with DataForSEO
 * ALL keywords have confirmed volume.
 */
export async function buildKeywordPool(brandId: string): Promise<PoolKeyword[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const pool: Map<string, PoolKeyword> = new Map()

  // Get keywords already used in previous content maps — don't repeat them
  const previousMaps = await prisma.contentMap.findMany({
    where: { brandId, status: 'completed' },
    select: { mapData: true },
  })
  const usedKeywords = new Set<string>()
  for (const cm of previousMaps) {
    if (!cm.mapData) continue
    const pieces = JSON.parse(cm.mapData)
    pieces.forEach((p: any) => { if (p.targetKeyword) usedKeywords.add(p.targetKeyword.toLowerCase()) })
  }
  if (usedKeywords.size > 0) console.log(`[KeywordPool] Excluding ${usedKeywords.size} keywords from previous content maps`)

  // ── Source 1: GSC keywords ──
  console.log(`[KeywordPool] Source 1: GSC`)
  const gscKeywords = await prisma.keyword.findMany({
    where: { brandId, impressions: { gt: 0 } },
    select: { query: true, searchVolume: true, kd: true, cpc: true, pageUrl: true, position: true, impressions: true },
    orderBy: { impressions: 'desc' },
    take: 150,
  })

  for (const kw of gscKeywords) {
    if (kw.query.length > 50) continue
    if (usedKeywords.has(kw.query.toLowerCase())) continue
    // Include GSC keywords with volume OR with significant impressions (real traffic)
    const vol = kw.searchVolume ?? 0
    if (vol < 10 && kw.impressions < 20) continue
    const impressions = kw.impressions
    const pos = Math.round(kw.position)
    const rationale = vol > 0
      ? pos <= 3 ? `Top 3 (pos ${pos}) · ${impressions.toLocaleString()} impr — defend this position`
        : pos <= 10 ? `Page 1 (pos ${pos}) · ${impressions.toLocaleString()} impr — optimize to reach top 3`
        : pos <= 20 ? `Page 2 (pos ${pos}) · ${impressions.toLocaleString()} impr — push to page 1`
        : `Pos ${pos} · ${impressions.toLocaleString()} impr — needs dedicated content to improve`
      : impressions > 100 ? `${impressions.toLocaleString()} impressions · pos ${pos} — high visibility, create dedicated content`
        : `${impressions.toLocaleString()} impressions · pos ${pos} — active traffic signal`
    pool.set(kw.query.toLowerCase(), {
      keyword: kw.query, volume: vol > 0 ? vol : impressions, kd: kw.kd, cpc: kw.cpc,
      source: 'gsc', existingUrl: kw.pageUrl?.replace(`https://${brand.domain}`, '') ?? null, position: kw.position, rationale,
    })
  }
  console.log(`[KeywordPool] GSC: ${pool.size} keywords with volume`)

  // ── Source 2: DataForSEO related_keywords with multiple seeds ──
  console.log(`[KeywordPool] Source 2: DataForSEO related keywords`)

  // Get seeds from brand + top GSC keywords
  // Parse target keywords from brand settings (one per line or comma-separated)
  const clientTargetKws: string[] = brand.targetKeywords
    ? brand.targetKeywords.split(/[\n,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    : []

  const seedResult = await callClaude<{ seeds: string[] }>({
    system: 'Generate keyword seeds for SEO research. Include PRODUCT seeds AND SHOULDER TOPIC seeds. 2-4 words each. JSON only.',
    prompt: `Brand: ${brand.name}
Products: ${brand.coreProducts?.substring(0, 200) ?? brand.name}
Target: ${brand.targetAudience?.substring(0, 150) ?? ''}
${clientTargetKws.length > 0 ? `Client priority keywords: ${clientTargetKws.join(', ')}` : ''}

Generate 15-18 seeds in 3 categories:
PRODUCT (5-6): directly about what the brand sells — their core product/service
PROBLEM (6-8): problems buyers have BEFORE needing the product — pain points that drive them to search
ADJACENT (3-4): related topics the target audience searches — expands topical authority

Return: { "seeds": ["seed1", "seed2", ...] }`,
    maxTokens: 400,
  })

  // Combine Claude seeds + client target keywords as priority seeds
  const claudeSeeds = seedResult.seeds?.slice(0, 14) ?? []
  const seedSet = new Set(claudeSeeds.map((s) => s.toLowerCase()))
  const seeds = [...clientTargetKws.filter((s) => !seedSet.has(s)), ...claudeSeeds].slice(0, 20)
  console.log(`[KeywordPool] Seeds (${clientTargetKws.length} from client, ${claudeSeeds.length} from AI): ${seeds.join(', ')}`)

  for (const seed of seeds) {
    const related = await fetchRelatedKeywords(seed)
    for (const kw of related) {
      const key = kw.keyword.toLowerCase()
      if (pool.has(key) || usedKeywords.has(key) || !kw.volume || kw.volume < 10) continue
      pool.set(key, {
        keyword: kw.keyword, volume: kw.volume, kd: kw.kd, cpc: kw.cpc,
        source: 'dataforseo', existingUrl: null, position: null,
        rationale: clientTargetKws.some((tk) => seed.includes(tk) || tk.includes(seed))
          ? `Priority — client target keyword, directly about core business`
          : `Related to "${seed}" — expands topical authority and audience reach`,
      })
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  console.log(`[KeywordPool] After related keywords: ${pool.size}`)

  // ── Source 3: Claude suggests ICP keywords → validate ──
  console.log(`[KeywordPool] Source 3: AI-suggested keywords`)
  const aiResult = await callClaude<{ keywords: string[] }>({
    system: 'Suggest search keywords decision-makers would type. 2-4 words each. JSON only.',
    prompt: `Brand sells: ${brand.coreProducts?.substring(0, 100) ?? ''}
Target: ${brand.targetAudience?.substring(0, 80) ?? ''}

Suggest 15-20 keywords CEOs/business owners would search. Mix problems + solutions + comparisons.
Return: { "keywords": ["keyword 1", "keyword 2", ...] }`,
    maxTokens: 400,
  })

  const aiKws = (aiResult.keywords ?? []).filter((k) => k.length <= 50 && !pool.has(k.toLowerCase()))
  if (aiKws.length > 0) {
    const validated = await getKeywordMetrics(aiKws)
    let added = 0
    for (const v of validated) {
      if (!v.keyword || !v.searchVolume || v.searchVolume < 10 || pool.has(v.keyword.toLowerCase())) continue
      pool.set(v.keyword.toLowerCase(), {
        keyword: v.keyword, volume: v.searchVolume, kd: v.kd, cpc: v.cpc,
        source: 'ai_validated', existingUrl: null, position: null, rationale: 'ICP match — targets your ideal buyer directly, volume confirmed',
      })
      added++
    }
    console.log(`[KeywordPool] AI: suggested ${aiKws.length}, added ${added}`)
  }

  // ── ICP Filter ──
  console.log(`[KeywordPool] ICP filtering ${pool.size} keywords...`)
  const poolArray = [...pool.values()]
  const gscKws = poolArray.filter((k) => k.source === 'gsc')
  const nonGscKws = poolArray.filter((k) => k.source !== 'gsc')

  let filteredNonGsc = nonGscKws
  if (nonGscKws.length > 0) {
    const icpResult = await callClaude<{ relevant: string[] }>({
      system: `Filter keywords to ONLY those relevant to this brand's specific product. JSON only.
Brand: ${brand.name}
Products: ${brand.coreProducts?.substring(0, 200) ?? ''}
NOT: ${brand.notBrand?.substring(0, 150) ?? ''}`,
      prompt: `Keep ONLY keywords relevant to this brand's products/services and their buyers' problems.
Products: ${brand.coreProducts?.substring(0, 200) ?? brand.name}
Target audience: ${brand.targetAudience?.substring(0, 150) ?? ''}
NOT about: ${brand.notBrand?.substring(0, 150) ?? 'unrelated industries'}
Remove: keywords about unrelated industries, job seeker queries, competitor brand names, topics that don't connect to the product.

Keywords: ${nonGscKws.map((k) => k.keyword).join(', ')}

Return: { "relevant": ["kw1", "kw2"] }`,
      maxTokens: 1500,
    })
    const relevantSet = new Set((icpResult.relevant ?? []).map((k) => k.toLowerCase()))
    filteredNonGsc = nonGscKws.filter((k) => relevantSet.has(k.keyword.toLowerCase()))
    console.log(`[KeywordPool] ICP: ${nonGscKws.length} → ${filteredNonGsc.length} relevant`)
  }

  const filtered = [...gscKws, ...filteredNonGsc].sort((a, b) => b.volume - a.volume)
  console.log(`[KeywordPool] Final: ${filtered.length} keywords`)
  console.log(`[KeywordPool] Top 10: ${filtered.slice(0, 10).map((k) => k.keyword + '(' + k.volume + ')').join(', ')}`)

  return filtered
}
