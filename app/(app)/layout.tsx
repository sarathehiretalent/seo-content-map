import { Sidebar } from '@/components/layout/sidebar'
import { prisma } from '@/lib/prisma'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true, domain: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex h-full">
      <Sidebar brands={brands} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
