import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportToGoogleSheets, type SheetData } from '@/lib/services/google-sheets'

export async function POST(request: NextRequest) {
  const { brandId, contentMapId } = await request.json()

  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const contentMap = await prisma.contentMap.findUniqueOrThrow({
    where: { id: contentMapId },
    include: {
      contentPieces: { orderBy: { sortOrder: 'asc' }, include: { keyword: true } },
      pageOptimizations: { orderBy: { potentialTrafficGain: 'desc' } },
    },
  })

  // Sheet 1: Content Map
  const contentSheet: SheetData = {
    sheetName: 'Content Map',
    headers: [
      'Pillar', 'Pillar Keyword', 'Cluster', 'Cluster Keyword',
      'Search Intent', 'KD', 'Competition', 'CPC', 'Volume',
      'GSC Position', 'GSC Clicks', 'GSC Impressions',
      'Title', 'Description', 'Type', 'Category', 'Reasoning',
      'PAA Questions', 'SERP Elements',
      'Opportunity Score', 'Priority', 'Status',
    ],
    rows: contentMap.contentPieces.map((p) => [
      p.pillarName, p.pillarKeyword, p.clusterName, p.clusterKeyword,
      p.intent, p.kd ?? '', p.competition ?? '', p.cpc ?? '', p.searchVolume ?? '',
      p.keyword?.position ?? '', p.keyword?.clicks ?? '', p.keyword?.impressions ?? '',
      p.title, p.description, p.contentType, p.category, p.reasoning,
      JSON.parse(p.paaQuestions).join('; '),
      JSON.parse(p.serpElements).join(', '),
      p.opportunityScore, p.priority, p.status,
    ]),
  }

  // Sheet 2: Page Optimizations
  const optimizeSheet: SheetData = {
    sheetName: 'Page Optimizations',
    headers: [
      'Page URL', 'Primary Keyword', 'Current Position', 'Potential Position',
      'Traffic Gain', 'Issue Type', 'Diagnosis', 'Recommendations',
      'Reasoning', 'Difficulty', 'Impact', 'Quick Win', 'Priority', 'Status',
    ],
    rows: contentMap.pageOptimizations.map((o) => [
      o.pageUrl, o.primaryKeyword, o.currentPosition, o.potentialPosition ?? '',
      o.potentialTrafficGain ?? '', o.issueType, o.diagnosis,
      JSON.parse(o.recommendations).join('; '),
      o.reasoning, o.difficulty, o.impact, o.isQuickWin, o.priority, o.status,
    ]),
  }

  // Sheet 3: AOE Strategy
  const aoeStrategy = await prisma.aoeStrategy.findFirst({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  })

  const aoeSheet: SheetData = {
    sheetName: 'AOE Strategy',
    headers: [
      'Target Query', 'Target Engine', 'Current Presence',
      'Recommended Content', 'Content Format', 'Optimization Tips',
      'Estimated Impact', 'Priority', 'Status',
    ],
    rows: (aoeStrategy?.items ?? []).map((i) => [
      i.targetQuery, i.targetEngine, i.currentPresence,
      i.recommendedContent, i.contentFormat,
      JSON.parse(i.optimizationTips).join('; '),
      i.estimatedImpact, i.priority, i.status,
    ]),
  }

  // Sheet 4: SERP Opportunities
  const serpSnapshot = await prisma.serpSnapshot.findFirst({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    include: {
      results: {
        include: { keyword: true },
        where: {
          OR: [
            { hasFeaturedSnippet: true, ownsFeaturedSnippet: false },
            { hasPaa: true },
            { hasAiOverview: true },
          ],
        },
      },
    },
  })

  const serpOppsSheet: SheetData = {
    sheetName: 'SERP Opportunities',
    headers: [
      'Keyword', 'Volume', 'Position', 'Featured Snippet (not owned)',
      'PAA Available', 'AI Overview Present', 'PAA Questions', 'Opportunity Type',
    ],
    rows: (serpSnapshot?.results ?? []).map((r) => {
      const oppTypes: string[] = []
      if (r.hasFeaturedSnippet && !r.ownsFeaturedSnippet) oppTypes.push('Featured Snippet')
      if (r.hasPaa) oppTypes.push('PAA')
      if (r.hasAiOverview) oppTypes.push('AI Overview')
      return [
        r.keyword?.query ?? '', r.keyword?.searchVolume ?? '', r.keyword?.position ?? '',
        r.hasFeaturedSnippet && !r.ownsFeaturedSnippet,
        r.hasPaa, r.hasAiOverview,
        JSON.parse(r.paaQuestions).join('; '),
        oppTypes.join(', '),
      ]
    }),
  }

  const url = await exportToGoogleSheets(
    `${brand.name} - Content Map ${contentMap.quarter ?? ''}`,
    [contentSheet, optimizeSheet, aoeSheet, serpOppsSheet]
  )

  return NextResponse.json({ url })
}
