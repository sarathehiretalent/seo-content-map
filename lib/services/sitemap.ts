/**
 * Parses a website's sitemap to count total URLs.
 * Handles sitemap index files (multiple sitemaps).
 */
export interface SitemapStats {
  totalUrls: number
  sitemaps: Array<{ url: string; count: number }>
}

export async function fetchSitemapStats(domain: string): Promise<SitemapStats> {
  const sitemapUrl = `https://${domain}/sitemap.xml`
  const stats: SitemapStats = { totalUrls: 0, sitemaps: [] }

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return stats
    const xml = await res.text()

    // Check if it's a sitemap index
    if (xml.includes('<sitemapindex')) {
      const sitemapUrls = [...xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi)].map((m) => m[1])

      for (const smUrl of sitemapUrls) {
        try {
          const smRes = await fetch(smUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000),
          })
          if (!smRes.ok) continue
          const smXml = await smRes.text()
          const urlCount = (smXml.match(/<url>/gi) ?? []).length
          stats.sitemaps.push({ url: smUrl, count: urlCount })
          stats.totalUrls += urlCount
        } catch { /* skip */ }
      }
    } else {
      // Single sitemap
      const urlCount = (xml.match(/<url>/gi) ?? []).length
      stats.sitemaps.push({ url: sitemapUrl, count: urlCount })
      stats.totalUrls = urlCount
    }
  } catch { /* sitemap not accessible */ }

  return stats
}
