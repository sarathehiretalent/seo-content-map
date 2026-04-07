import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite } from '@/lib/services/scraper'
import { deepResearch } from '@/lib/services/gemini'
import { callClaude } from '@/lib/services/anthropic'

export const maxDuration = 300 // Allow up to 5 min for this route

export async function POST(request: NextRequest) {
  const { brandId } = await request.json()
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })

  try {
    console.log(`[BrandIntel] === Starting for ${brand.domain} ===`)

    // ── Step 1: Scrape website ──
    console.log(`[BrandIntel] Step 1: Scraping...`)
    const pages = await scrapeWebsite(brand.domain)
    const pagesSummary = pages.map((p) => ({
      url: p.url.replace(`https://${brand.domain}`, ''),
      title: p.title,
      h1: p.h1,
      description: p.metaDescription.substring(0, 200),
    }))

    // ── Step 2: Gemini Deep Research (single comprehensive query) ──
    console.log(`[BrandIntel] Step 2: Gemini Deep Research (this takes 2-8 min)...`)
    const research = await deepResearch(
`Research the company "${brand.name}" at ${brand.domain}.
${brand.description ? `User says: "${brand.description}"` : ''}

Provide a comprehensive report covering:

1. CORE PRODUCTS & SERVICES: What exactly does this company sell? Features, how it works, pricing model.

2. BRAND CONFUSION: Find OTHER companies with similar names that could be confused with this brand. List all potential confusions.

3. DIRECT COMPETITORS: Find companies in the USA that sell the SAME type of product. For each:
   - Company name and website URL
   - What they sell that competes directly
   - Visit their website to confirm
   Only include TRUE direct competitors, not job boards or HR platforms.

4. TARGET AUDIENCE: Who buys this product? Industries, job titles, company sizes.

5. MARKET POSITION: How does this company differentiate? Unique advantages?`,
      10 // 10 min max
    )

    console.log(`[BrandIntel] Research complete: ${research.length} chars`)

    // ── Step 3: Claude structures and validates ──
    console.log(`[BrandIntel] Step 3: Claude reviewing...`)
    const structured = await callClaude<{
      coreProducts: string
      notBrand: string
      targetAudience: string
      competitors: string
      brandIntelligence: string
    }>({
      system: `You structure raw research into clean brand intelligence fields. Cross-reference with website data. Be accurate. JSON only.`,
      prompt: `Structure this research about ${brand.name} (${brand.domain}):

WEBSITE PAGES:
${JSON.stringify(pagesSummary.slice(0, 10), null, 2)}

RESEARCH REPORT:
${research.substring(0, 6000)}

Return JSON:
{
  "coreProducts": "Specific products/services. 3-4 sentences from research + website evidence.",
  "notBrand": "Companies/services that are NOT this brand. Be specific with names. 3-4 sentences.",
  "targetAudience": "Who buys. Industries, titles, company types. 2-3 sentences.",
  "competitors": "One per line: https://domain.com — Why they compete. Only confirmed direct competitors from the research.",
  "brandIntelligence": "3 paragraphs: 1) What they do + unique value, 2) Market position + differentiation, 3) Content strategy + opportunities."
}`,
      maxTokens: 3000,
    })

    // ── Step 4: Save ──
    const updateData: Record<string, string | null> = {}
    if (structured.coreProducts) updateData.coreProducts = structured.coreProducts
    if (structured.notBrand) updateData.notBrand = structured.notBrand
    if (structured.targetAudience) updateData.targetAudience = structured.targetAudience
    if (structured.competitors) updateData.competitors = structured.competitors
    if (structured.brandIntelligence) updateData.brandIntelligence = structured.brandIntelligence
    updateData.sitePages = JSON.stringify(pagesSummary)

    await prisma.brand.update({ where: { id: brandId }, data: updateData })

    console.log(`[BrandIntel] === Complete ===`)
    return NextResponse.json({ ...structured, pagesScraped: pages.length })
  } catch (error) {
    console.error('[BrandIntel] Failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
