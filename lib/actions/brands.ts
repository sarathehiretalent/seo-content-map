'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createBrand(formData: FormData) {
  const name = formData.get('name') as string
  const domain = (formData.get('domain') as string).replace(/^https?:\/\//, '').replace(/\/$/, '')
  const vertical = (formData.get('vertical') as string) || null
  const description = (formData.get('description') as string) || null

  if (!name || !domain) {
    return { error: 'Name and domain are required' }
  }

  const brand = await prisma.brand.create({
    data: { name, domain, vertical, description },
  })

  revalidatePath('/dashboard')
  revalidatePath('/brands')
  return { id: brand.id }
}

export async function listBrands() {
  return prisma.brand.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBrand(id: string) {
  return prisma.brand.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          keywords: true,
          diagnostics: true,
          contentMaps: true,
          serpSnapshots: true,
          aoeStrategies: true,
        },
      },
    },
  })
}

export async function updateBrand(id: string, formData: FormData) {
  // Only update fields that are present in the form — never null out fields not sent
  const data: Record<string, string | null> = {}

  const fields = [
    'name', 'domain', 'vertical', 'description', 'gscProperty',
    'coreProducts', 'notBrand', 'targetAudience', 'competitors', 'brandIntelligence', 'targetKeywords',
  ]

  for (const field of fields) {
    const value = formData.get(field)
    if (value !== null) {
      let str = value as string
      if (field === 'domain') str = str.replace(/^https?:\/\//, '').replace(/\/$/, '')
      data[field] = str || null
    }
  }

  const brand = await prisma.brand.update({
    where: { id },
    data,
  })

  revalidatePath(`/brands/${id}`)
  revalidatePath('/dashboard')
  return { id: brand.id }
}

export async function deleteBrand(id: string) {
  await prisma.brand.delete({ where: { id } })
  revalidatePath('/dashboard')
  return { success: true }
}
