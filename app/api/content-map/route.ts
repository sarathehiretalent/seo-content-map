import { NextResponse } from 'next/server'

// This old route redirects to the new content-map-gen
export async function POST() {
  return NextResponse.json({ error: 'Use /api/content-map-gen instead' }, { status: 410 })
}
