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

const fallbackModel = 'claude-sonnet-4-20250514'

function parsePrompt(body: unknown) {
  if (typeof body === 'string') {
    try {
      return parsePrompt(JSON.parse(body))
    } catch {
      return ''
    }
  }

  if (!body || typeof body !== 'object' || !('prompt' in body)) {
    return ''
  }

  const prompt = (body as { prompt?: unknown }).prompt
  return typeof prompt === 'string' ? prompt.trim().slice(0, 500) : ''
}

function extractSvg(text: string) {
  const match = text.match(/<svg[\s\S]*<\/svg>/i)
  return match?.[0] ?? ''
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
  const prompt = parsePrompt(request.body)

  if (!prompt) {
    response.status(400).json({ error: 'Prompt is required.' })
    return
  }

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
      max_tokens: 1800,
      system:
        'You design quiet premium modular brand marks. Return only one valid SVG, no Markdown, no explanation. Use simple geometric black/dark shapes on a white background. No external images, no scripts, no text nodes except a title.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Create a bold source motif for this prompt: "${prompt}". The SVG must be 800 by 800, centered, high contrast, simple enough to become a pixel grid mark.`,
            },
          ],
        },
      ],
    }),
  })

  if (!claudeResponse.ok) {
    response.status(claudeResponse.status).json({ error: 'Claude motif generation failed.' })
    return
  }

  const data = (await claudeResponse.json()) as { content?: ClaudeTextBlock[] }
  const text = data.content?.find((block) => block.type === 'text')?.text ?? ''
  const svg = extractSvg(text)

  if (!svg) {
    response.status(502).json({ error: 'Claude did not return SVG.' })
    return
  }

  response.status(200).json({ svg, source: 'claude' })
}
