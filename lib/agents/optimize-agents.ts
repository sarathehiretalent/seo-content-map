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
  const withIssues = pages.filter((p) => p.titleLength === 0 || p.titleLength > 60 || p.titleLength < 30 || (p.primaryKeyword && !p.title.toLowerCase().includes(p.primaryKeyword.split(' ')[0].toLowerCase())))
  if (withIssues.length === 0) return []
  console.log(`[TitleAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You are an SEO expert optimizing title tags to maximize click-through rate from search results.

IMPORTANT: The "keyword" provided is from Google Search Console — it may NOT match the page's actual topic. Always check the H1 and current title to understand what the page is really about. If the GSC keyword doesn't match the page content, optimize for the page's actual topic instead.

Rules:
- 50-60 characters (Google truncates at ~60)
- Primary keyword near the start (first 3 words if possible)
- Include a compelling hook: number, year, power word, or benefit
- Differentiate from generic competitor titles
- Match search intent: informational → "Guide/How to", commercial → "Best/Top/Review", transactional → "Buy/Get/Try"
- Do NOT stuff keywords — it must read naturally
- If the current title is already good (correct length, has keyword, compelling), skip it

Brand: ${brandName}. JSON only.`,
    (batch) => `Fix titles:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, current: p.title, len: p.titleLength, impressions: p.impressions })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "title", "issue": "specific problem", "current": "current title", "suggested": "new title (50-60 chars)", "reason": "why this improves CTR", "priority": "high|medium|low" }] }\nPriority: high if >100 impressions, medium if >20, low otherwise. Only generate fixes for pages that NEED changes.`,
    'title')
}

// ═══ Meta Description Agent ═══
async function runMetaAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.metaDescriptionLength === 0 || p.metaDescriptionLength > 160 || p.metaDescriptionLength < 120)
  if (withIssues.length === 0) return []
  console.log(`[MetaAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You are an SEO expert writing meta descriptions that maximize click-through rate.

IMPORTANT: The "keyword" provided is from Google Search Console — it may NOT match the page's actual topic. Always check the H1 and current title to understand what the page is really about. Optimize for the page's actual topic.

Rules:
- 150-160 characters (Google truncates at ~160)
- Include the primary keyword naturally in the first sentence
- End with a clear CTA or value proposition (Learn how, Discover, Get started, Compare)
- Address the searcher's intent: answer their question partially to entice the click
- Include a differentiator: data point, year, unique angle
- Do NOT write generic descriptions like "Learn more about X" — be specific
- If the current meta is already good, skip it

Brand: ${brandName}. JSON only.`,
    (batch) => `Fix meta descriptions:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, title: p.title, current: p.metaDescription.substring(0, 160), len: p.metaDescriptionLength, impressions: p.impressions })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "meta_description", "issue": "specific problem", "current": "current meta", "suggested": "new meta (150-160 chars)", "reason": "why this improves CTR", "priority": "high|medium|low" }] }\nPriority based on impressions. Only fix pages that need changes.`,
    'meta_description')
}

// ═══ Schema Agent ═══
async function runSchemaAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  // Analyze ALL pages — even those with schema may need additional types (e.g., has Organization but needs FAQPage)
  const withIssues = pages
  if (withIssues.length === 0) return []
  console.log(`[SchemaAgent] ${withIssues.length} pages (including ${pages.filter(p => p.hasSchema).length} with existing schema)`)
  return batchedAgent(withIssues,
    `You recommend schema markup for SEO and Answer Engine Optimization (AEO).
Types: Article (blog posts), FAQPage (pages with questions — CRITICAL for AI citation), Organization (about/home), Service (service pages), WebPage (general).
IMPORTANT:
- If a page ALREADY has the correct schema type, do NOT generate a fix for it — it's fine.
- If a page has schema but is MISSING an additional recommended type (e.g., has Organization but should also have FAQPage), recommend adding the missing type.
- If a page has NO schema, recommend the most appropriate type.
- If a page has PAA questions, ALWAYS recommend FAQPage schema.
Brand: ${brandName}. JSON only.`,
    (batch) => `Review schema for:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, h2Count: p.h2s.length, words: p.wordCount, existingSchemas: p.schemas, paaQuestions: p.paaQuestions.length > 0 ? p.paaQuestions : undefined })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "schema", "issue": "description of what's missing", "current": "existing schemas or None", "suggested": "Add [Type] schema with [details]", "reason": "why", "priority": "high|medium|low" }] }\nONLY generate fixes for pages that NEED changes. Skip pages where schema is already correct.`,
    'schema')
}

// ═══ Content Agent ═══
async function runContentAgent(pages: PageContext[], brandName: string): Promise<PageFix[]> {
  const withIssues = pages.filter((p) => p.wordCount < 1200 || p.h1Count !== 1 || p.h2s.length < 3 || (p.paaQuestions.length > 0 && !p.h2s.some((h: string) => h.includes('?'))))
  if (withIssues.length === 0) return []
  console.log(`[ContentAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You are an SEO content expert optimizing pages for rankings AND AI engine citability (AEO).

Check these in order of impact:
1. H1: Must contain primary keyword, only 1 H1 per page
2. Content depth: Blog posts need 1,500+ words for competitive keywords. Service pages need 800+
3. H2 structure: At least 3-5 H2s covering subtopics. Format as questions when possible (AI engines prefer question headings)
4. FAQ section: If PAA (People Also Ask) questions exist, add a FAQ section with those EXACT questions answered in 40-60 words each
5. Internal links: Reference related pages with keyword-rich anchor text
6. Data points: Include statistics, numbers, or cited data every 200-300 words for AI citability

IMPORTANT: Do NOT recommend changes to pages that are already well-optimized. Only flag real issues that would impact rankings.
Brand: ${brandName}. JSON only.`,
    (batch) => `Analyze content:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, h1: p.h1, h1Count: p.h1Count, h2s: p.h2s.slice(0, 8), words: p.wordCount, impressions: p.impressions, paaQuestions: p.paaQuestions.length > 0 ? p.paaQuestions : undefined })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "content", "issue": "specific problem found", "current": "what the page has now", "suggested": "specific actionable fix with examples", "reason": "expected SEO/AEO impact", "priority": "high|medium|low" }] }\nPriority: high if keyword has >100 impressions, medium if >20. Only generate fixes for pages with real issues.`,
    'content', 10)
}

// ═══ Links & Images Agent ═══
async function runLinksAgent(pages: PageContext[], brandName: string, orphanPages: string[] = []): Promise<PageFix[]> {
  const orphanSet = new Set(orphanPages.map(p => p.toLowerCase()))
  const withIssues = pages.filter((p) => p.internalLinks < 5 || p.imagesWithoutAlt > 0 || !p.hasCanonical || orphanSet.has(p.path.toLowerCase()))
  if (withIssues.length === 0) return []
  console.log(`[LinksAgent] ${withIssues.length} pages`)
  return batchedAgent(withIssues,
    `You are an SEO expert fixing technical on-page issues that affect crawlability and rankings.

Check:
1. Internal links: Pages need 5+ internal links to related pages. Anchor text should include relevant keywords, not "click here"
2. Image alt text: Every image needs descriptive alt text with the page's keyword when relevant. Missing alt = missed ranking opportunity in image search
3. Canonical tags: Every page needs a canonical URL pointing to itself to prevent duplicate content issues
4. Orphan pages: Pages marked as "orphan" have NO internal links pointing to them from other pages — they are invisible to Google. Recommend specific pages that should link to them.

Only flag issues that actually exist. Do NOT generate fixes for pages that are already correct.
Brand: ${brandName}. JSON only.`,
    (batch) => `Fix technical issues:\n${JSON.stringify(batch.map((p) => ({ path: p.path, keyword: p.primaryKeyword, internalLinks: p.internalLinks, imagesWithoutAlt: p.imagesWithoutAlt, hasCanonical: p.hasCanonical, impressions: p.impressions, isOrphan: orphanSet.has(p.path.toLowerCase()) })), null, 2)}\n\nReturn: { "fixes": [{ "url": "path", "type": "internal_links|images|canonical", "issue": "specific problem", "current": "current state", "suggested": "specific fix — for orphan pages, suggest which pages should link to this one", "reason": "SEO impact", "priority": "high|medium|low" }] }\nOrphan pages are always HIGH priority. Only generate fixes for pages with real issues.`,
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
  orphanPages: string[] = [],
): Promise<{ fixes: PageFix[]; summary: string }> {
  // Filter out 404 and error pages
  const validAuditData = auditData.filter((a) => !a.statusCode || a.statusCode === 200 || a.statusCode === 301 || a.statusCode === 302)
  const skipped = auditData.length - validAuditData.length
  if (skipped > 0) console.log(`[OptimizeAgents] Skipped ${skipped} error pages (404, 500, etc.)`)

  const pages = validAuditData.map((a) => buildPageContext(a, domain, keywordMap, paaMap))
  console.log(`[OptimizeAgents] Running 6 agents for ${pages.length} pages...`)

  const [titleFixes, metaFixes, schemaFixes, contentFixes, linksFixes, cannibalFixes] = await Promise.all([
    runTitleAgent(pages, brandName).catch(() => [] as PageFix[]),
    runMetaAgent(pages, brandName).catch(() => [] as PageFix[]),
    runSchemaAgent(pages, brandName).catch(() => [] as PageFix[]),
    runContentAgent(pages, brandName).catch(() => [] as PageFix[]),
    runLinksAgent(pages, brandName, orphanPages).catch(() => [] as PageFix[]),
    runCannibalizationAgent(cannibalization, pages, brandName).catch(() => [] as PageFix[]),
  ])

  const allFixes = [...titleFixes, ...metaFixes, ...schemaFixes, ...contentFixes, ...linksFixes, ...cannibalFixes]
  console.log(`[OptimizeAgents] Total: ${allFixes.length} (T:${titleFixes.length} M:${metaFixes.length} S:${schemaFixes.length} C:${contentFixes.length} L:${linksFixes.length} Cannibal:${cannibalFixes.length})`)

  const summary = `Analyzed ${pages.length} pages with 6 specialized agents. Found ${allFixes.length} fixes: ${titleFixes.length} title, ${metaFixes.length} meta description, ${schemaFixes.length} schema, ${contentFixes.length} content, ${linksFixes.length} technical, ${cannibalFixes.length} cannibalization. ${allFixes.filter((f) => f.priority === 'high').length} high priority.`
  return { fixes: allFixes, summary }
}
