import { GoogleGenAI } from '@google/genai'

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured in .env.local')
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

/**
 * Starts a Gemini Deep Research task. Returns the interaction ID immediately.
 * Use pollResearch() to check for completion.
 */
export async function startDeepResearch(prompt: string): Promise<string> {
  const genai = getClient()

  console.log(`[Gemini] Starting deep research...`)

  const interaction = await (genai as any).interactions.create({
    input: prompt,
    agent: 'deep-research-pro-preview-12-2025',
    background: true,
  })

  console.log(`[Gemini] Research started: ${interaction.id}`)
  return interaction.id as string
}

/**
 * Polls a deep research interaction. Returns { status, text }.
 */
export async function pollResearch(interactionId: string): Promise<{ status: string; text: string | null }> {
  const genai = getClient()

  const result = await (genai as any).interactions.get(interactionId)
  const status = result.status as string

  if (status === 'completed') {
    const outputs = result.outputs ?? []
    const text = outputs[outputs.length - 1]?.text ?? ''
    return { status: 'completed', text }
  }

  if (status === 'failed') {
    return { status: 'failed', text: result.error ?? 'Research failed' }
  }

  return { status: 'in_progress', text: null }
}

/**
 * Runs deep research and waits for completion (with extended timeout).
 * For use in background pipelines.
 */
export async function deepResearch(prompt: string, maxMinutes = 10): Promise<string> {
  const interactionId = await startDeepResearch(prompt)

  const maxWait = maxMinutes * 60 * 1000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 10000))

    const result = await pollResearch(interactionId)
    console.log(`[Gemini] Poll: ${result.status} (${Math.round((Date.now() - start) / 1000)}s)`)

    if (result.status === 'completed' && result.text) {
      return result.text
    }
    if (result.status === 'failed') {
      throw new Error(`Gemini Deep Research failed: ${result.text}`)
    }
  }

  throw new Error(`Gemini Deep Research timed out after ${maxMinutes} minutes`)
}
