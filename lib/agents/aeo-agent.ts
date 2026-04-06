import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'

/**
 * AEO Agent — analyzes pages for AI citability.
 * Scores each page and generates specific actions.
 * Uses data from Page Audit + SERP Analysis.
 */

export interface AeoPageResult {
  url: string
  path: string
  primaryKeyword: string
  impressions: number
  // Current state
  hasSchema: boolean
  hasFaqSchema: boolean
  h2Count: number
  h2sAsQuestions: number
  wordCount: number
  internalLinks: number
  // SERP features (if available)
  hasPaa: boolean
  hasAiOverview: boolean
  hasFeaturedSnippet: boolean
  ownsFeaturedSnippet: boolean
  paaQuestions: string[]
  // Score
  readinessScore: number // 0-100
  readinessLevel: 'ready' | 'needs_work' | 'not_optimized'
  // Actions
  actions: Array<{
    type: string
    action: string
    impact: 'high' | 'medium' | 'low'
    done: boolean
  }>
}

export async function runAeoAnalysis(brandId: string): Promise<{ pages: AeoPageResult[]; summary: string }> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  // Get page audit data
  const audit = await prisma.pageAudit.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { auditData: true },
  })
  const auditPages: Array<any> = audit?.auditData ? JSON.parse(audit.auditData) : []

  // Get SERP data
  const serpAnalysis = await prisma.serpAnalysis.findFirst({
    where: { brandId, status: 'completed' },
    orderBy: { createdAt: 'desc' },
    select: { serpPerformance: true },
  })
  const serpPerf: Array<any> = serpAnalysis?.serpPerformance ? JSON.parse(serpAnalysis.serpPerformance) : []

  // Get keywords for impressions
  const keywords = await prisma.keyword.findMany({
    where: { brandId, impressions: { gt: 0 } },
    select: { query: true, pageUrl: true, impressions: true },
    orderBy: { impressions: 'desc' },
  })

  // Build page keyword map
  const pageKwMap: Record<string, { keyword: string; impressions: number }> = {}
  for (const kw of keywords) {
    if (!kw.pageUrl) continue
    if (!pageKwMap[kw.pageUrl]) pageKwMap[kw.pageUrl] = { keyword: kw.query, impressions: kw.impressions }
  }

  // Build SERP map by URL
  const serpMap: Record<string, any> = {}
  for (const s of serpPerf) {
    if (s.ourUrl) serpMap[s.ourUrl] = s
  }

  // Analyze ALL audited pages
  const results: AeoPageResult[] = []

  for (const page of auditPages) {
    const path = page.url.replace(`https://${brand.domain}`, '')
    const kwData = pageKwMap[page.url]

    const serpData = serpMap[path]

    // Count H2s that are questions
    const h2s: string[] = page.h2s ?? []
    const h2sAsQuestions = h2s.filter((h: string) => h.includes('?') || h.toLowerCase().startsWith('how') || h.toLowerCase().startsWith('what') || h.toLowerCase().startsWith('why') || h.toLowerCase().startsWith('when') || h.toLowerCase().startsWith('which')).length

    const hasFaqSchema = (page.schemas ?? []).some((s: string) => s.toLowerCase().includes('faq'))

    // Calculate readiness score (0-100)
    let score = 0
    if (page.hasSchema) score += 10
    if (hasFaqSchema) score += 15
    if (h2sAsQuestions >= 3) score += 15
    else if (h2sAsQuestions >= 1) score += 8
    if (page.wordCount >= 1500) score += 15
    else if (page.wordCount >= 800) score += 8
    if (page.internalLinks >= 5) score += 10
    else if (page.internalLinks >= 3) score += 5
    if (h2s.length >= 5) score += 10
    if (serpData?.features?.paa) score += 10
    if (serpData?.features?.ownsFeaturedSnippet) score += 15
    else if (serpData?.features?.featuredSnippet) score += 5

    const level = score >= 70 ? 'ready' : score >= 40 ? 'needs_work' : 'not_optimized'

    // Build actions
    const actions: AeoPageResult['actions'] = []

    if (!hasFaqSchema) {
      const paaQs = serpData?.features?.paaQuestions ?? []
      actions.push({
        type: 'faq_schema',
        action: paaQs.length > 0
          ? `Add FAQPage schema with these PAA questions: ${paaQs.slice(0, 4).join(', ')}`
          : 'Add FAQPage schema with common questions about this topic',
        impact: 'high',
        done: false,
      })
    }

    if (h2sAsQuestions < 3) {
      actions.push({
        type: 'h2_questions',
        action: `Reformat H2s as questions (currently ${h2sAsQuestions} of ${h2s.length} are questions). AI engines extract question-format headings more easily.`,
        impact: 'high',
        done: false,
      })
    }

    if (page.wordCount < 1500) {
      actions.push({
        type: 'content_depth',
        action: `Expand content from ${page.wordCount} to 1,500+ words. Include data points every 150-200 words for AI citability.`,
        impact: 'medium',
        done: false,
      })
    }

    if (!page.hasSchema) {
      actions.push({
        type: 'schema',
        action: 'Add Article or WebPage schema with author information for E-E-A-T signals.',
        impact: 'medium',
        done: false,
      })
    }

    if (page.internalLinks < 3) {
      actions.push({
        type: 'internal_links',
        action: `Add more internal links (currently ${page.internalLinks}). Link to related pillar/cluster pages.`,
        impact: 'low',
        done: false,
      })
    }

    if (serpData?.features?.featuredSnippet && !serpData?.features?.ownsFeaturedSnippet) {
      actions.push({
        type: 'snippet_opportunity',
        action: `Featured snippet exists for "${kwData?.keyword ?? 'this keyword'}" but competitor owns it. Add a direct 40-60 word answer in the first paragraph.`,
        impact: 'high',
        done: false,
      })
    }

    if (serpData?.features?.aiOverview) {
      actions.push({
        type: 'ai_overview',
        action: `AI Overview appears for "${kwData?.keyword ?? 'this keyword'}". Ensure first paragraph directly answers the search query. Include cited statistics.`,
        impact: 'high',
        done: false,
      })
    }

    results.push({
      url: page.url,
      path,
      primaryKeyword: kwData?.keyword ?? page.title ?? path,
      impressions: kwData?.impressions ?? 0,
      hasSchema: page.hasSchema,
      hasFaqSchema,
      h2Count: h2s.length,
      h2sAsQuestions,
      wordCount: page.wordCount,
      internalLinks: page.internalLinks,
      hasPaa: !!serpData?.features?.paa,
      hasAiOverview: !!serpData?.features?.aiOverview,
      hasFeaturedSnippet: !!serpData?.features?.featuredSnippet,
      ownsFeaturedSnippet: !!serpData?.features?.ownsFeaturedSnippet,
      readinessScore: score,
      readinessLevel: level,
      actions,
      paaQuestions: serpData?.features?.paaQuestions ?? [],
    })
  }

  // Sort by impressions desc (pages without keyword data go to the end)
  results.sort((a, b) => b.impressions - a.impressions)

  // Generate summary
  const ready = results.filter((r) => r.readinessLevel === 'ready').length
  const needsWork = results.filter((r) => r.readinessLevel === 'needs_work').length
  const notOpt = results.filter((r) => r.readinessLevel === 'not_optimized').length
  const totalActions = results.reduce((s, r) => s + r.actions.length, 0)
  const withSerp = results.filter((r) => r.hasPaa || r.hasAiOverview || r.hasFeaturedSnippet).length
  const withKeyword = results.filter((r) => r.impressions > 0).length
  const noKeyword = results.length - withKeyword

  const summary = `Analyzed all ${results.length} audited pages for AI citability. ${ready} AI-ready, ${needsWork} need work, ${notOpt} not optimized. ${withKeyword} pages have GSC keyword data${noKeyword > 0 ? `, ${noKeyword} pages have no GSC impressions (limited scoring — no keyword or SERP context)` : ''}. ${withSerp > 0 ? `${withSerp} pages have SERP feature data.` : 'Run SERP Analysis to enrich scores with featured snippet/PAA/AI Overview data.'} ${totalActions} total actions, ${results.filter((r) => r.actions.some((a) => a.impact === 'high')).length} pages with high-impact opportunities.`

  console.log(`[AEO] ${results.length} pages analyzed. Ready: ${ready}, Needs work: ${needsWork}, Not optimized: ${notOpt}`)
  return { pages: results, summary }
}
