import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { BrandTabs } from '@/components/brand/brand-tabs'

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({
    where: { id },
    select: { id: true, name: true, domain: true },
  })

  if (!brand) notFound()

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-6 pt-4">
        <div className="mb-3">
          <h1 className="text-xl font-semibold">{brand.name}</h1>
          <p className="text-sm text-muted-foreground">{brand.domain}</p>
        </div>
        <BrandTabs brandId={brand.id} />
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
