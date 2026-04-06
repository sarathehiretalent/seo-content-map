'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function deleteDiagnostic(diagnosticId: string) {
  const diag = await prisma.diagnostic.findUnique({ where: { id: diagnosticId } })
  if (!diag) return { error: 'Diagnostic not found' }

  await prisma.diagnostic.delete({ where: { id: diagnosticId } })
  revalidatePath(`/brands/${diag.brandId}/diagnostic`)
  revalidatePath(`/brands/${diag.brandId}`)
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteAllDiagnostics(brandId: string) {
  await prisma.diagnostic.deleteMany({ where: { brandId } })
  // Also clear keywords so next diagnostic starts fresh
  await prisma.keyword.deleteMany({ where: { brandId } })
  revalidatePath(`/brands/${brandId}/diagnostic`)
  revalidatePath(`/brands/${brandId}`)
  revalidatePath('/dashboard')
  return { success: true }
}
