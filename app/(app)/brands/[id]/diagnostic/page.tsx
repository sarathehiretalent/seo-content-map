import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { DiagnosticClient } from './diagnostic-client'

export default async function DiagnosticPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      diagnostics: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { keywords: true } },
    },
  })

  if (!brand) notFound()

  return <DiagnosticClient brand={brand} />
}
