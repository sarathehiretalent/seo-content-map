import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { DiagnosticContext } from './types'

interface StructureResult {
  structure: {
    pillars: Array<{
      name: string
      keyword: string
      pages: string[]
      clusters: Array<{
        name: string
        keyword: string
        pages: string[]
      }>
    }>
    orphanPages: Array<{
      url: string
      topKeyword: string
      impressions: number
      reason: string
    }>
  }
  gaps: Array<{
    topic: string
    keywords: string[]
    reason: string
  }>
  cannibalization: Array<{
    keyword: string
    pages: string[]
    recommendation: string
  }>
  summary: string
}

export async function runCurrentStructure(ctx: DiagnosticContext): Promise<StructureResult> {
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: ctx.brandId },
  })

  const keywords = await prisma.keyword.findMany({
    where: { brandId: ctx.brandId },
    orderBy: { impressions: 'desc' },
    take: 500,
  })

  // Build page-level data with their keywords
  const pageData: Record<string, { keywords: Array<{ query: string; position: number; impressions: number }>; totalImpressions: number }> = {}
  for (const kw of keywords) {
    const page = kw.pageUrl ?? 'unknown'
    if (page === 'unknown') continue
    if (!pageData[page]) pageData[page] = { keywords: [], totalImpressions: 0 }
    pageData[page].keywords.push({ query: kw.query, position: kw.position, impressions: kw.impressions })
    pageData[page].totalImpressions += kw.impressions
  }

  // Create a clean summary for Claude — pages with their top keywords
  const pageSummary = Object.entries(pageData)
    .sort(([, a], [, b]) => b.totalImpressions - a.totalImpressions)
    .map(([url, data]) => ({
      url: url.replace(`https://${brand.domain}`, ''),
      topKeywords: data.keywords.sort((a, b) => b.impressions - a.impressions).slice(0, 5).map((k) => `${k.query} (${k.impressions} impr, pos ${Math.round(k.position)})`),
      totalKeywords: data.keywords.length,
      totalImpressions: data.totalImpressions,
    }))

  console.log(`[Structure] Analyzing ${pageSummary.length} pages with traffic`)

  const result = await callClaude<StructureResult & { intents: Record<string, string> }>({
    system: `You are an SEO expert analyzing a website's content structure.
You receive REAL data from Google Search Console — actual pages with their actual keywords and impressions.

Your job:
1. Identify which pages function as PILLARS (broad topic pages that should link to clusters)
2. Identify which pages are CLUSTERS (specific subtopic pages linked to a pillar)
3. Identify ORPHAN pages (have traffic but don't fit into any pillar/cluster structure)
4. Find keyword cannibalization (2+ pages competing for same keyword)
5. Find content gaps

A PILLAR page:
- Covers a broad topic comprehensively
- Has many keywords with significant impressions
- Usually the homepage or main service pages
- Example: "/blog/pre-employment-testing-guide/" is a pillar about pre-employment testing

A CLUSTER page:
- Covers a specific subtopic in depth
- Supports a pillar page's topic
- Example: "/blog/integrity-test-questions/" is a cluster under the integrity testing pillar

An ORPHAN page:
- Has traffic but doesn't clearly belong to any pillar/cluster group
- Could be standalone content, tangential topics, or pages that SHOULD be connected but aren't

Brand: ${brand.name} (${brand.domain})
Products: ${brand.coreProducts ?? 'Not specified'}

IMPORTANT: Only assign pages to pillars/clusters based on their ACTUAL keywords and topic. Don't force pages into groups where they don't belong. It's better to have orphan pages than wrong groupings.

Respond with valid JSON only.`,
    prompt: `Analyze these ${pageSummary.length} pages and their real keyword data:

${JSON.stringify(pageSummary, null, 2)}

Return JSON:
{
  "structure": {
    "pillars": [
      {
        "name": "Pillar topic name",
        "keyword": "primary keyword of this pillar",
        "pages": ["URLs that serve as pillar pages"],
        "clusters": [
          { "name": "Subtopic name", "keyword": "cluster keyword", "pages": ["URLs"] }
        ]
      }
    ],
    "orphanPages": [
      { "url": "/page-path/", "topKeyword": "main keyword", "impressions": 100, "reason": "Why it's not in a pillar/cluster" }
    ]
  },
  "gaps": [
    { "topic": "Missing topic", "keywords": ["related keywords found in data"], "reason": "Why this content is missing" }
  ],
  "cannibalization": [
    { "keyword": "keyword", "pages": ["url1", "url2"], "recommendation": "What to do" }
  ],
  "intents": { "keyword": "informational|transactional|commercial|navigational" },
  "summary": "2-3 paragraph analysis: 1) Current structure health, 2) Main issues found, 3) Key recommendations. Reference specific pages and data."
}`,
    maxTokens: 8192,
  })

  // Update keyword intents
  if (result.intents) {
    for (const [query, intent] of Object.entries(result.intents)) {
      await prisma.keyword.updateMany({
        where: { brandId: ctx.brandId, query },
        data: { intent },
      })
    }
  }

  // Count stats
  const pagesInStructure = new Set<string>()
  for (const pillar of result.structure?.pillars ?? []) {
    for (const p of pillar.pages ?? []) pagesInStructure.add(p)
    for (const c of pillar.clusters ?? []) {
      for (const p of c.pages ?? []) pagesInStructure.add(p)
    }
  }
  const orphanCount = result.structure?.orphanPages?.length ?? 0
  console.log(`[Structure] Pillars: ${result.structure?.pillars?.length ?? 0}, Pages in structure: ${pagesInStructure.size}, Orphans: ${orphanCount}`)

  return {
    structure: result.structure,
    gaps: result.gaps,
    cannibalization: result.cannibalization,
    summary: result.summary,
  }
}
