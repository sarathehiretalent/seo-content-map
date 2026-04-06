import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportToGoogleSheets, type SheetData } from '@/lib/services/google-sheets'

export async function POST(request: NextRequest) {
  const { brandId, diagnosticId } = await request.json()

  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const diagnostic = diagnosticId
    ? await prisma.diagnostic.findUniqueOrThrow({ where: { id: diagnosticId } })
    : await prisma.diagnostic.findFirstOrThrow({ where: { brandId, status: 'completed' }, orderBy: { createdAt: 'desc' } })

  // Sheet 1: Rankings
  const keywords = await prisma.keyword.findMany({
    where: { brandId },
    orderBy: { impressions: 'desc' },
  })

  const rankingsSheet: SheetData = {
    sheetName: 'Rankings Actuales',
    headers: ['Keyword', 'Position', 'Clicks', 'Impressions', 'CTR', 'Volume', 'KD', 'CPC', 'Competition', 'Intent', 'Page URL'],
    rows: keywords.map((k) => [
      k.query, k.position, k.clicks, k.impressions,
      Math.round(k.ctr * 10000) / 100, k.searchVolume ?? '', k.kd ?? '',
      k.cpc ?? '', k.competitionLevel ?? '', k.intent ?? '', k.pageUrl ?? '',
    ]),
  }

  // Sheet 2: SERP Analysis
  const serpSnapshot = await prisma.serpSnapshot.findFirst({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    include: { results: { include: { keyword: true } } },
  })

  const serpSheet: SheetData = {
    sheetName: 'SERP Analysis',
    headers: [
      'Keyword', 'Featured Snippet', 'Owns FS', 'PAA', 'PAA Questions',
      'AI Overview', 'Knowledge Panel', 'Video', 'Local Pack', 'Image Pack',
      'Sitelinks', 'Top Competitors',
    ],
    rows: (serpSnapshot?.results ?? []).map((r) => [
      r.keyword?.query ?? '', r.hasFeaturedSnippet, r.ownsFeaturedSnippet,
      r.hasPaa, JSON.parse(r.paaQuestions).join('; '),
      r.hasAiOverview, r.hasKnowledgePanel, r.hasVideoResults,
      r.hasLocalPack, r.hasImagePack, r.hasSitelinks,
      JSON.parse(r.topCompetitors).map((c: { domain: string }) => c.domain).join(', '),
    ]),
  }

  // Sheet 3: Current Structure
  const structure = diagnostic.currentStructure ? JSON.parse(diagnostic.currentStructure) : {}
  const gaps = diagnostic.gaps ? JSON.parse(diagnostic.gaps) : []
  const cannibalization = diagnostic.cannibalization ? JSON.parse(diagnostic.cannibalization) : []

  const structureRows: (string | number | boolean)[][] = []
  structureRows.push(['=== PILLAR/CLUSTER STRUCTURE ===', '', '', ''])
  for (const pillar of structure.pillars ?? []) {
    structureRows.push(['PILLAR', pillar.name, pillar.keyword, (pillar.pages ?? []).join(', ')])
    for (const cluster of pillar.clusters ?? []) {
      structureRows.push(['  CLUSTER', cluster.name, cluster.keyword, (cluster.pages ?? []).join(', ')])
    }
  }
  structureRows.push(['', '', '', ''])
  structureRows.push(['=== GAPS ===', '', '', ''])
  for (const gap of gaps) {
    structureRows.push(['GAP', gap.topic, (gap.keywords ?? []).join(', '), gap.reason])
  }
  structureRows.push(['', '', '', ''])
  structureRows.push(['=== CANNIBALIZATION ===', '', '', ''])
  for (const c of cannibalization) {
    structureRows.push(['CANNIBAL', c.keyword, (c.pages ?? []).join(', '), c.recommendation])
  }
  structureRows.push(['', '', '', ''])
  structureRows.push(['=== SUMMARY ===', '', '', ''])
  structureRows.push([diagnostic.summary ?? '', '', '', ''])

  const structureSheet: SheetData = {
    sheetName: 'Estructura Actual',
    headers: ['Type', 'Name/Topic', 'Keywords', 'Details'],
    rows: structureRows,
  }

  const url = await exportToGoogleSheets(
    `${brand.name} - Diagnostic SEO`,
    [rankingsSheet, serpSheet, structureSheet]
  )

  return NextResponse.json({ url })
}
