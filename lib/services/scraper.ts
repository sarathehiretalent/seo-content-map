/**
 * Scrapes a website to extract brand context.
 * Fetches homepage + sitemap/key pages to understand the full site.
 */

export interface ScrapedPage {
  url: string
  title: string
  metaDescription: string
  h1: string
  h2s: string[]
}

export async function scrapeWebsite(domain: string): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = []
  const fetched = new Set<string>()

  async function scrapePage(path: string): Promise<ScrapedPage | null> {
    const url = `https://${domain}${path}`
    if (fetched.has(url)) return null
    fetched.add(url)

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)', Accept: 'text/html' },
        redirect: 'follow',
      })
      if (!res.ok) return null
      const html = await res.text()

      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
      if (title.includes('Page Not Found') || title.includes('404')) return null

      const meta = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)?.[1]?.trim() ?? ''
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''
      const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter((t) => t.length > 3 && t.length < 150)
        .slice(0, 8)

      return { url, title, metaDescription: meta, h1, h2s }
    } catch {
      return null
    }
  }

  // Scrape homepage
  const home = await scrapePage('/')
  if (home) pages.push(home)

  // Try to find internal links from homepage
  try {
    const res = await fetch(`https://${domain}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    })
    const html = await res.text()
    const links = [...html.matchAll(/href=["'](\/[^"'#?]*?)["']/g)]
      .map((m) => m[1])
      .filter((l) => !l.includes('.') || l.endsWith('/'))
      .filter((l, i, arr) => arr.indexOf(l) === i)
      .slice(0, 25)

    for (const link of links) {
      const page = await scrapePage(link)
      if (page) pages.push(page)
    }
  } catch { /* ignore */ }

  // Try known paths
  for (const path of ['/about-us/', '/about/', '/services/', '/products/', '/for-business/', '/blog/', '/contact/']) {
    if (pages.length >= 20) break
    const page = await scrapePage(path)
    if (page) pages.push(page)
  }

  console.log(`[Scraper] Scraped ${pages.length} pages from ${domain}`)
  return pages
}
