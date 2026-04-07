import { Sidebar } from '@/components/layout/sidebar'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  let brands
  if (!user || user.role === 'admin') {
    // Admin sees all brands
    brands = await prisma.brand.findMany({
      select: { id: true, name: true, domain: true },
      orderBy: { createdAt: 'desc' },
    })
  } else {
    // Regular users see only assigned brands
    const memberships = await prisma.brandMember.findMany({
      where: { userId: user.id },
      include: { brand: { select: { id: true, name: true, domain: true } } },
    })
    brands = memberships.map((m) => m.brand)
  }

  return (
    <div className="flex h-full">
      <Sidebar brands={brands} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
