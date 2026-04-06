import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

/**
 * Calls Claude and returns parsed JSON.
 * Uses Sonnet with strong JSON enforcement in the prompt.
 * Robust parser handles code blocks and trailing text.
 */
export async function callClaude<T>(options: {
  system: string
  prompt: string
  maxTokens?: number
  temperature?: number
}): Promise<T> {
  const anthropic = getClient()

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: options.maxTokens ?? 8192,
    temperature: options.temperature ?? 0.3,
    system: options.system + '\n\nCRITICAL: Your entire response must be valid JSON. Start with { and end with }. No markdown, no code blocks, no text before or after the JSON.',
    messages: [{ role: 'user', content: options.prompt }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  return parseJsonResponse<T>(textBlock.text)
}

function parseJsonResponse<T>(raw: string): T {
  let text = raw.trim()

  // 1. Try direct parse
  try { return JSON.parse(text) as T } catch { /* continue */ }

  // 2. Remove markdown code blocks
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()) as T } catch { /* continue */ }
    text = codeBlock[1].trim()
  }

  // 3. Find JSON object boundaries
  const firstBrace = text.indexOf('{')
  if (firstBrace >= 0) {
    let depth = 0
    let inString = false
    let escape = false
    for (let i = firstBrace; i < text.length; i++) {
      const ch = text[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"' && !escape) { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) {
          const jsonStr = text.substring(firstBrace, i + 1)
          try { return JSON.parse(jsonStr) as T } catch { /* continue */ }
          break
        }
      }
    }
  }

  console.error('[Claude] All JSON parse attempts failed. Raw (first 300):', text.substring(0, 300))
  throw new Error('Claude returned invalid JSON')
}
