/**
 * Scrapes individual pages for on-page SEO audit data:
 * meta title, meta description, H1, H2s, word count,
 * schema markup, internal links, images, canonical URL
 */

export interface PageAuditData {
  url: string
  // Meta
  title: string
  titleLength: number
  metaDescription: string
  metaDescriptionLength: number
  // Headings
  h1: string
  h1Count: number
  h2s: string[]
  // Content
  wordCount: number
  // Schema
  schemas: string[] // types found: FAQPage, Article, Product, etc.
  hasSchema: boolean
  // Links
  internalLinks: number
  externalLinks: number
  brokenInternalLinks: string[]
  // Images
  totalImages: number
  imagesWithoutAlt: number
  // Technical
  canonicalUrl: string | null
  hasCanonical: boolean
  // Status
  statusCode: number
  lastModified: string | null
}

export async function auditPage(url: string, domain: string): Promise<PageAuditData | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })

    const statusCode = res.status
    if (!res.ok && statusCode !== 301 && statusCode !== 302) {
      return { url, title: '', titleLength: 0, metaDescription: '', metaDescriptionLength: 0, h1: '', h1Count: 0, h2s: [], wordCount: 0, schemas: [], hasSchema: false, internalLinks: 0, externalLinks: 0, brokenInternalLinks: [], totalImages: 0, imagesWithoutAlt: 0, canonicalUrl: null, hasCanonical: false, statusCode, lastModified: null }
    }

    const html = await res.text()
    const lastModified = res.headers.get('last-modified')

    // Title
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''

    // Meta description
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim()
      ?? html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i)?.[1]?.trim()
      ?? ''

    // H1
    const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    const h1 = h1Matches[0]?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''

    // H2s
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter((t) => t.length > 2 && t.length < 200)
      .slice(0, 15)

    // Word count (strip HTML, count words)
    let textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    textContent = textContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    textContent = textContent.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    textContent = textContent.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    textContent = textContent.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    textContent = textContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length

    // Schema (JSON-LD)
    const schemaMatches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    const schemas: string[] = []
    for (const m of schemaMatches) {
      try {
        const data = JSON.parse(m[1])
        const type = data['@type']
        if (Array.isArray(type)) schemas.push(...type)
        else if (type) schemas.push(type)
      } catch { /* invalid JSON-LD */ }
    }

    // Links
    const linkMatches = [...html.matchAll(/<a[^>]*href=["']([^"'#]*?)["'][^>]*>/gi)]
    let internalLinks = 0
    let externalLinks = 0
    for (const m of linkMatches) {
      const href = m[1]
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue
      if (href.startsWith('/') || href.includes(domain)) internalLinks++
      else if (href.startsWith('http')) externalLinks++
    }

    // Images
    const imgMatches = [...html.matchAll(/<img[^>]*>/gi)]
    const totalImages = imgMatches.length
    const imagesWithoutAlt = imgMatches.filter((m) => !m[0].includes('alt=') || m[0].match(/alt=["']\s*["']/)).length

    // Canonical
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([\s\S]*?)["']/i)
    const canonicalUrl = canonicalMatch?.[1]?.trim() ?? null

    return {
      url,
      title,
      titleLength: title.length,
      metaDescription: metaDesc,
      metaDescriptionLength: metaDesc.length,
      h1,
      h1Count: h1Matches.length,
      h2s,
      wordCount,
      schemas,
      hasSchema: schemas.length > 0,
      internalLinks,
      externalLinks,
      brokenInternalLinks: [],
      totalImages,
      imagesWithoutAlt,
      canonicalUrl,
      hasCanonical: !!canonicalUrl,
      statusCode,
      lastModified,
    }
  } catch {
    return null
  }
}

/**
 * Audits multiple pages. Returns results for all pages that respond.
 */
export async function auditPages(urls: string[], domain: string): Promise<PageAuditData[]> {
  const results: PageAuditData[] = []

  // Process in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < urls.length; i += 5) {
    const batch = urls.slice(i, i + 5)
    const batchResults = await Promise.all(batch.map((url) => auditPage(url, domain)))
    results.push(...batchResults.filter((r): r is PageAuditData => r !== null))

    if (i + 5 < urls.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return results
}
