import { NextRequest, NextResponse } from 'next/server'
import { fetchOverview } from '@/lib/services/gsc'

export async function GET(request: NextRequest) {
  const siteUrl = request.nextUrl.searchParams.get('siteUrl')
  const startDate = request.nextUrl.searchParams.get('startDate') ?? undefined
  const endDate = request.nextUrl.searchParams.get('endDate') ?? undefined

  if (!siteUrl) {
    return NextResponse.json({ error: 'siteUrl required' }, { status: 400 })
  }

  try {
    const overview = await fetchOverview(siteUrl, startDate, endDate)
    return NextResponse.json(overview)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
