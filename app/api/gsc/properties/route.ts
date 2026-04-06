import { NextResponse } from 'next/server'
import { listGscProperties } from '@/lib/services/gsc'

export async function GET() {
  try {
    const properties = await listGscProperties()
    return NextResponse.json({ properties })
  } catch (error) {
    console.error('[GSC] Failed to list properties:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list GSC properties' },
      { status: 500 }
    )
  }
}
