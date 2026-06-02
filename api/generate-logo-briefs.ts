type VercelRequest = {
  method?: string
  body?: unknown
}

type VercelResponse = {
  status: (code: number) => VercelResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
}

type ClaudeTextBlock = {
  type: 'text'
  text: string
}

type LogoBrief = {
  name: string
  prompt: string
  style: 'monogram' | 'emblem' | 'orbital' | 'signal'
}

const fallbackModel = 'claude-sonnet-4-20250514'
const allowedStyles = new Set(['monogram', 'emblem', 'orbital', 'signal'])

function parseBody(requestBody: unknown) {
  if (typeof requestBody === 'string') {
    try {
      return parseBody(JSON.parse(requestBody))
    } catch {
      return {}
    }
  }

  return requestBody && typeof requestBody === 'object' ? requestBody as Record<string, unknown> : {}
}

function parseText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 800) : fallback
}

function parseCount(value: unknown) {
  const count = Number(value)
  return Number.isFinite(count) ? Math.max(4, Math.min(16, Math.round(count))) : 16
}

function parseStyle(value: unknown) {
  return typeof value === 'string' && allowedStyles.has(value) ? value : 'monogram'
}

function extractJsonArray(text: string) {
  const match = text.match(/\[[\s\S]*\]/)
  return match?.[0] ?? '[]'
}

function sanitizeBriefs(value: unknown, count: number): LogoBrief[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item, index) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const style = parseStyle(record.style)
      const name = parseText(record.name, `Richtung ${index + 1}`).slice(0, 40)
      const prompt = parseText(record.prompt, name)

      if (!prompt) {
        return null
      }

      return { name, prompt, style }
    })
    .filter((item): item is LogoBrief => Boolean(item))
    .slice(0, count)
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).json({})
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Use POST.' })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  const body = parseBody(request.body)
  const prompt = parseText(body.prompt, 'premium modular Veyra logo mark')
  const sketchSummary = parseText(body.sketchSummary, 'No sketch provided.')
  const style = parseStyle(body.style)
  const count = parseCount(body.count)

  if (!apiKey) {
    response.status(501).json({ error: 'ANTHROPIC_API_KEY is not configured.' })
    return
  }

  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || fallbackModel,
      max_tokens: 5200,
      system:
        'You are a premium logo creative director for a quiet modern pixel-branding tool. Return only valid JSON, no Markdown. Create distinct modular logo directions that can become simple SVG source motifs and then pixel grid marks. Avoid generic mascots, words, slogans, flags, or copied brand styles.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Create exactly ${count} logo briefs as a JSON array. Each item must have "name", "prompt", and "style". Style must be one of: monogram, emblem, orbital, signal. Current user prompt: "${prompt}". Preferred starting style: ${style}. Sketch context: ${sketchSummary}. Keep prompts concise, premium, geometric, commercially usable, and suitable for a modular pixel mark.`,
            },
          ],
        },
      ],
    }),
  })

  if (!claudeResponse.ok) {
    response.status(claudeResponse.status).json({ error: 'Claude logo brief generation failed.' })
    return
  }

  const data = (await claudeResponse.json()) as { content?: ClaudeTextBlock[] }
  const text = data.content?.find((block) => block.type === 'text')?.text ?? ''

  try {
    const briefs = sanitizeBriefs(JSON.parse(extractJsonArray(text)), count)

    if (!briefs.length) {
      response.status(502).json({ error: 'Claude did not return usable logo briefs.' })
      return
    }

    response.status(200).json({ briefs, source: 'claude' })
  } catch {
    response.status(502).json({ error: 'Claude did not return valid JSON.' })
  }
}
