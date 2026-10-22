export type StreamDelta = { done: true } | { done?: false, text?: string }

export function streamDelta(data: string): StreamDelta {
  const value = data.trim()
  if (value === '[DONE]') return { done: true }
  try {
    const parsed = JSON.parse(value) as { choices?: { delta?: { content?: unknown } }[], error?: { message?: unknown } }
    if (parsed.error) throw new Error(typeof parsed.error.message === 'string' ? parsed.error.message : JSON.stringify(parsed.error))
    const content = parsed.choices?.[0]?.delta?.content
    return typeof content === 'string' && content ? { text: content } : {}
  } catch (error) {
    if (error instanceof SyntaxError) return {}
    throw error
  }
}

export function completionText(body: unknown): string | undefined {
  const content = (body as { choices?: { message?: { content?: unknown } }[] } | undefined)?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : undefined
}

export function serviceError(status: number, text: string): string {
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message
    if (typeof message === 'string' && message) return `${status}: ${message}`
  } catch {
  }
  return `${status}${text.trim() ? `: ${text.trim().slice(0, 300)}` : ''}`
}
