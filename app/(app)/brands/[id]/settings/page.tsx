import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const brand = await prisma.brand.findUnique({ where: { id } })
  if (!brand) notFound()

  const hasGoogleToken = !!(await prisma.googleToken.findFirst())

  return <SettingsClient brand={brand} hasGoogleToken={hasGoogleToken} />
}
