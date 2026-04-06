import { callClaude } from '@/lib/services/anthropic'
import type { PageAuditData } from '@/lib/services/page-audit-scraper'

export interface PageFix {
  url: string
  type: string
  issue: string
  current: string
  suggested: string
  reason: string
  priority: 'high' | 'medium' | 'low'
}

interface PageContext {
  path: string
  fullUrl: string
  primaryKeyword: string
  impressions: number
  title: string
  titleLength: number
  metaDescription: string
  metaDescriptionLength: number
  h1: string
  h1Count: number
  h2s: string[]
  wordCount: number
  schemas: string[]
  hasSchema: boolean
  internalLinks: number
  imagesWithoutAlt: number
  hasCanonical: boolean
  paaQuestions: string[]
}

function buildPageContext(audit: PageAuditData, domain: string, keywordMap: Record<string, { keyword: string; impressions: number }>, paaMap: Record<string, string[]>): PageContext {
  const kw = keywordMap[audit.url] ?? { keyword: '', impressions: 0 }
  return {
    path: audit.url.replace(`https://${domain}`, '') || '/',
    fullUrl: audit.url,
    primaryKeyword: kw.keyword, impressions: kw.impressions,
    paaQuestions: paaMap[audit.url] ?? [],
    title: audit.title, titleLength: audit.titleLength,
    metaDescription: audit.metaDescription, metaDescriptionLength: audit.metaDescriptionLength,
    h1: audit.h1, h1Count: audit.h1Count, h2s: audit.h2s,
    wordCount: audit.wordCount, schemas: audit.schemas, hasSchema: audit.hasSchema,
    internalLinks: audit.internalLinks, imagesWithoutAlt: audit.imagesWithoutAlt, hasCanonical: audit.hasCanonical,
  }
}

/** Process pages in batches to ensure Claude generates fixes for ALL pages */
async function batchedAgent(
  pages: PageContext[],
  system: string,
  promptBuilder: (batch: PageContext[]) => string,
  type: string,
  batchSize = 15,
): Promise<PageFix[]> {
  const allFixes: PageFix[] = []
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize)
    try {
      const result = await callClaude<{ fixes: PageFix[] }>({ system, prompt: promptBuilder(batch), maxTokens: 3000 })
      const fixes = (result.fixes ?? []).map((f) => ({ ...f, type: f.type || type }))
      allFixes.push(...fixes)
    } catch (e) {
      console.error(`[${type}Agent] Batch ${i} failed:`, e instanceof Error ? e.message : e)
    }
  }
  return allFixes
}

// ═══ Title Agent ═══
async function runTitleAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.titleLength === 0 || p.titleLength > 60 || (p.primaryKeyword && !p.title.toLowerCase().includes(p.primaryKeyword.split(' ')[0].toLowerCase())))
  if (withIssues.length === 0) return []
  console.log(`[TitleAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You optimize title tags. 50-60 chars, keyword near start, compelling. Brand: ${brandName}. JSON only.`,
    (batch) => `Fix titles:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, current: p.title, len: p.titleLength })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "title", "issue": "problem", "current": "old", "suggested": "new title", "reason": "why", "priority": "high|medium|low" }] }\nGenerate fix for EVERY page listed.`,
    'title')
}

// ═══ Meta Description Agent ═══
async function runMetaAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.metaDescriptionLength === 0 || p.metaDescriptionLength > 160 || p.metaDescriptionLength < 120)
  if (withIssues.length === 0) return []
  console.log(`[MetaAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You optimize meta descriptions. 150-160 chars, keyword included, CTA at end. Brand: ${brandName}. JSON only.`,
    (batch) => `Fix meta descriptions:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, current: p.metaDescription.substring(0, 160), len: p.metaDescriptionLength })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "meta_description", "issue": "problem", "current": "old", "suggested": "new meta", "reason": "why", "priority": "high|medium|low" }] }\nGenerate fix for EVERY page.`,
    'meta_description')
}

// ═══ Schema Agent ═══
async function runSchemaAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => !p.hasSchema)
  if (withIssues.length === 0) return []
  console.log(`[SchemaAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You recommend schema markup for SEO and Answer Engine Optimization (AEO).
Types: Article (blog posts), FAQPage (pages with questions — CRITICAL for AI citation), Organization (about/home), Service (service pages), WebPage (general).
IMPORTANT: If a page has PAA (People Also Ask) questions, ALWAYS recommend FAQPage schema with those exact questions. This increases AI citation probability by 40-60%.
Brand: ${brandName}. JSON only.`,
    (batch) => `Add schema to:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, h2Count: p.h2s.length, words: p.wordCount, paaQuestions: p.paaQuestions.length > 0 ? p.paaQuestions : undefined })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "schema", "issue": "No structured data", "current": "None", "suggested": "Add [Type] schema with [details]. If PAA questions exist, include FAQPage schema.", "reason": "why — mention AEO/AI citation benefit if FAQPage", "priority": "high|medium|low" }] }\nGenerate fix for EVERY page.`,
    'schema')
}

// ═══ Content Agent ═══
async function runContentAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.wordCount < 800 || p.h1Count !== 1 || p.h2s.length < 2)
  if (withIssues.length === 0) return []
  console.log(`[ContentAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You optimize content structure for SEO and Answer Engine Optimization (AEO).
Check: H1 keyword alignment, H2 subtopics, content depth, FAQ sections.
IMPORTANT for AEO: If a page has PAA questions, recommend adding a FAQ section with those exact questions answered in 30-50 words each. Format H2s as questions when possible — AI engines extract question-format headings more easily.
Brand: ${brandName}. JSON only.`,
    (batch) => `Fix content:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, h1Count: p.h1Count, h2s: p.h2s.slice(0, 5), words: p.wordCount, paaQuestions: p.paaQuestions.length > 0 ? p.paaQuestions : undefined })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "content", "issue": "problem", "current": "state", "suggested": "fix — include specific FAQ questions to add if PAA data exists", "reason": "why — mention AEO benefit if adding FAQ", "priority": "high|medium|low" }] }\nGenerate fix for EVERY page.`,
    'content')
}

// ═══ Links & Images Agent ═══
async function runLinksAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.internalLinks < 3 || p.imagesWithoutAlt > 0 || !p.hasCanonical)
  if (withIssues.length === 0) return []
  console.log(`[LinksAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You fix technical on-page SEO: internal links, image alt text, canonical tags. Brand: ${brandName}. JSON only.`,
    (batch) => `Fix technical issues:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, links: p.internalLinks, noAlt: p.imagesWithoutAlt, canonical: p.hasCanonical })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "internal_links|images|canonical", "issue": "problem", "current": "state", "suggested": "fix", "reason": "why", "priority": "high|medium|low" }] }\nGenerate fix for EVERY page with issues.`,
    'internal_links')
}

// ═══ Cannibalization Agent ═══
async function runCannibalizationAgent(
  cannibalization: Array<{ keyword: string; pages: string[]; recommendation: string }>,
  pages: PageContext[],
  brandName: string,
): Promise<PageFix[]> {
  if (cannibalization.length === 0) return []

  console.log(`[CannibalizationAgent] ${cannibalization.length} cannibalized keywords`)

  // Enrich with page data
  const enriched = cannibalization.map((c) => {
    const pageData = c.pages.map((url) => {
      const p = pages.find((pg) => url.includes(pg.path) || pg.path.includes(url.replace(/^https?:\/\/[^/]+/, '')))
      return { url, title: p?.title ?? '', h1: p?.h1 ?? '', impressions: p?.impressions ?? 0, keyword: p?.primaryKeyword ?? '' }
    })
    return { ...c, pageData }
  })

  const result = await callClaude<{ fixes: PageFix[] }>({
    system: `You are a keyword cannibalization expert. When multiple pages compete for the same keyword, you decide:
1. Which page should be the PRIMARY page for that keyword (keep and optimize)
2. What to do with the other pages (redirect 301, merge content, re-target to different keyword, add canonical)

Be specific: name the exact URL that should win and what to do with each competing URL.
Brand: ${brandName}. JSON only.`,
    prompt: `Resolve these cannibalization issues:

${JSON.stringify(enriched.map((c) => ({
  keyword: c.keyword,
  pages: c.pageData.map((p) => ({ url: p.url, title: p.title, impressions: p.impressions })),
  currentRecommendation: c.recommendation,
})), null, 2)}

Return: { "fixes": [{ "url": "the competing page URL (NOT the winner)", "type": "cannibalization", "issue": "Competing with [other URL] for keyword: [keyword]", "current": "Both pages target [keyword]", "suggested": "Specific action: redirect to X, re-target to keyword Y, add canonical to X, or merge into X", "reason": "Why this page should yield to the other", "priority": "high|medium|low" }] }

Generate a fix for EACH competing page (not the winner).`,
    maxTokens: 3000,
  })

  return (result.fixes ?? []).map((f) => ({ ...f, type: 'cannibalization' }))
}

// ═══ Orchestrator ═══
export async function runAllOptimizeAgents(
  auditData: PageAuditData[], domain: string, brandName: string,
  keywordMap: Record<string, { keyword: string; impressions: number }>,
  paaMap: Record<string, string[]> = {},
  cannibalization: Array<{ keyword: string; pages: string[]; recommendation: string }> = [],
): Promise<{ fixes: PageFix[]; summary: string }> {
  const pages = auditData.map((a) => buildPageContext(a, domain, keywordMap, paaMap))
  console.log(`[OptimizeAgents] Running 6 agents for ${pages.length} pages...`)

  const [titleFixes, metaFixes, schemaFixes, contentFixes, linksFixes, cannibalFixes] = await Promise.all([
    runTitleAgent(pages, brandName).catch(() => [] as PageFix[]),
    runMetaAgent(pages, brandName).catch(() => [] as PageFix[]),
    runSchemaAgent(pages, brandName).catch(() => [] as PageFix[]),
    runContentAgent(pages, brandName).catch(() => [] as PageFix[]),
    runLinksAgent(pages, brandName).catch(() => [] as PageFix[]),
    runCannibalizationAgent(cannibalization, pages, brandName).catch(() => [] as PageFix[]),
  ])

  const allFixes = [...titleFixes, ...metaFixes, ...schemaFixes, ...contentFixes, ...linksFixes, ...cannibalFixes]
  console.log(`[OptimizeAgents] Total: ${allFixes.length} (T:${titleFixes.length} M:${metaFixes.length} S:${schemaFixes.length} C:${contentFixes.length} L:${linksFixes.length} Cannibal:${cannibalFixes.length})`)

  const summary = `Analyzed ${pages.length} pages with 6 specialized agents. Found ${allFixes.length} fixes: ${titleFixes.length} title, ${metaFixes.length} meta description, ${schemaFixes.length} schema, ${contentFixes.length} content, ${linksFixes.length} technical, ${cannibalFixes.length} cannibalization. ${allFixes.filter((f) => f.priority === 'high').length} high priority.`
  return { fixes: allFixes, summary }
}
