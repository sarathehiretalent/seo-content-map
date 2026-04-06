import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/services/anthropic'
import type { ContentMapPiece } from './content-strategist'

export interface ContentBrief {
  pieceId: string
  title: string
  targetKeyword: string
  suggestedH2s: string[]
  wordCountTarget: number
  eeat: { experience: string; expertise: string; authority: string; trust: string }
  paaToAnswer: string[]
  internalLinkAnchors: Array<{ text: string; targetPage: string }>
  competitorNotes: string
  callToAction: string
}

/**
 * Generates briefs in small batches (3-5 pieces at a time) to avoid JSON truncation.
 */
export async function runContentBriefs(
  brandId: string,
  pieces: ContentMapPiece[]
): Promise<ContentBrief[]> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })
  const toCreate = pieces.filter((p) => p.status === 'to_create')
  if (toCreate.length === 0) return []

  console.log(`[ContentBrief] Generating briefs for ${toCreate.length} pieces (batches of 3)`)

  const allBriefs: ContentBrief[] = []

  // Process 3 at a time — small enough for reliable JSON
  for (let i = 0; i < toCreate.length; i += 3) {
    const batch = toCreate.slice(i, i + 3)

    try {
      const result = await callClaude<{ briefs: Array<{ id: string; h2s: string[]; words: number; eeat: { exp: string; expt: string; auth: string; trust: string }; paa: string[]; links: Array<{ text: string; to: string }>; cta: string }> }>({
        system: `Generate SEO content briefs. Keep brief. JSON only.`,
        prompt: `Brand: ${brand.name}. Products: ${brand.coreProducts?.substring(0, 100) ?? ''}

Briefs for:
${batch.map((p) => `- id:"${p.id}" title:"${p.title}" kw:"${p.targetKeyword}" type:${p.contentType} funnel:${p.funnelStage}`).join('\n')}

Return: { "briefs": [{ "id": "piece id", "h2s": ["H2 as question 1", "H2 2"], "words": 1500, "eeat": { "exp": "experience tip", "expt": "expertise tip", "auth": "authority tip", "trust": "trust tip" }, "paa": ["question 1"], "links": [{ "text": "anchor", "to": "target page" }], "cta": "call to action" }] }`,
        maxTokens: 2000,
      })

      for (const b of result.briefs ?? []) {
        const piece = batch.find((p) => p.id === b.id)
        allBriefs.push({
          pieceId: b.id,
          title: piece?.title ?? '',
          targetKeyword: piece?.targetKeyword ?? '',
          suggestedH2s: b.h2s ?? [],
          wordCountTarget: b.words ?? 1500,
          eeat: { experience: b.eeat?.exp ?? '', expertise: b.eeat?.expt ?? '', authority: b.eeat?.auth ?? '', trust: b.eeat?.trust ?? '' },
          paaToAnswer: b.paa ?? [],
          internalLinkAnchors: (b.links ?? []).map((l) => ({ text: l.text, targetPage: l.to })),
          competitorNotes: '',
          callToAction: b.cta ?? '',
        })
      }
    } catch (err) {
      console.error(`[ContentBrief] Batch ${i} failed:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`[ContentBrief] Generated ${allBriefs.length} briefs`)
  return allBriefs
}
