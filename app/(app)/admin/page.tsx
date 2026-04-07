import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminClient } from './admin-client'

export default async function AdminPage() {
  try {
    await requireAdmin()
  } catch {
    redirect('/dashboard')
  }

  const rawUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  })
  const users = rawUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))

  const brands = await prisma.brand.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, domain: true, createdBy: true },
  })

  const brandMembers = await prisma.brandMember.findMany({
    include: { user: { select: { id: true, name: true, email: true } }, brand: { select: { id: true, name: true } } },
  })

  const rawActivity = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { name: true, email: true } } },
  })
  const recentActivity = rawActivity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))

  return <AdminClient users={users} brands={brands} brandMembers={brandMembers} recentActivity={recentActivity} />
}
