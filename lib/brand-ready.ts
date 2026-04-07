/**
 * Single source of truth for "is this brand ready to run analysis?"
 * Used across Diagnostic, Optimize, Content Map, etc.
 */

interface BrandFields {
  description?: string | null
  brandIntelligence?: string | null
  coreProducts?: string | null
  gscProperty?: string | null
}

/** Brand has enough context for AI agents to understand what it does */
export function hasBrandContext(brand: BrandFields): boolean {
  return !!(
    (brand.description && brand.description.length > 20) ||
    brand.brandIntelligence ||
    brand.coreProducts
  )
}

/** Brand is connected to Google Search Console */
export function hasGscConnected(brand: BrandFields): boolean {
  return !!brand.gscProperty
}

/** Brand is fully ready to run diagnostic */
export function isReadyForDiagnostic(brand: BrandFields): boolean {
  return hasBrandContext(brand) && hasGscConnected(brand)
}

/** What's missing — returns user-friendly messages */
export function getMissingSteps(brand: BrandFields): string[] {
  const missing: string[] = []
  if (!hasBrandContext(brand)) missing.push('Run Brand Analysis or add a description in Settings')
  if (!hasGscConnected(brand)) missing.push('Connect Google Search Console in Settings')
  return missing
}
