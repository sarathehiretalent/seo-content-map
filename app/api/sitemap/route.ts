import { NextRequest, NextResponse } from 'next/server'
import { fetchSitemapStats } from '@/lib/services/sitemap'

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get('domain')
  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  try {
    const stats = await fetchSitemapStats(domain)
    return NextResponse.json(stats)
  } catch {
    return NextResponse.json({ totalUrls: 0, sitemaps: [] })
  }
}
