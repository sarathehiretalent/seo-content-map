import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Updates a single piece within a content map's mapData JSON.
 * Used for: marking as published, setting publish date, editing title.
 */
export async function POST(request: NextRequest) {
  const { contentMapId, pieceId, updates } = await request.json()

  if (!contentMapId || !pieceId || !updates) {
    return NextResponse.json({ error: 'contentMapId, pieceId, and updates required' }, { status: 400 })
  }

  const cm = await prisma.contentMap.findUnique({ where: { id: contentMapId } })
  if (!cm || !cm.mapData) {
    return NextResponse.json({ error: 'Content map not found' }, { status: 404 })
  }

  const pieces = JSON.parse(cm.mapData)
  const pieceIndex = pieces.findIndex((p: any) => p.id === pieceId)

  if (pieceIndex === -1) {
    return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
  }

  // Apply updates
  if (updates.published !== undefined) {
    pieces[pieceIndex].published = updates.published
    if (updates.published && !pieces[pieceIndex].publishedDate) {
      pieces[pieceIndex].publishedDate = new Date().toISOString().split('T')[0]
    }
  }
  if (updates.publishedDate !== undefined) {
    pieces[pieceIndex].publishedDate = updates.publishedDate
    // Update publishDay to match the actual day of the date
    if (updates.publishedDate) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const date = new Date(updates.publishedDate + 'T12:00:00')
      pieces[pieceIndex].publishDay = dayNames[date.getDay()]
    }
  }
  if (updates.title !== undefined) {
    pieces[pieceIndex].title = updates.title
  }

  await prisma.contentMap.update({
    where: { id: contentMapId },
    data: { mapData: JSON.stringify(pieces) },
  })

  return NextResponse.json({ ok: true, piece: pieces[pieceIndex] })
}
