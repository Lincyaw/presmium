import type { IncomingMessage, ServerResponse } from 'node:http'
import { workspacePath } from '../domain/index.ts'
import { text } from './messages.ts'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MAX_BODY = 1 << 20

/**
 * Reads a JSON request body. Requiring `application/json` makes cross-site
 * form posts impossible: browsers preflight such requests, and the dev server
 * does not allow foreign origins.
 */
export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, text().notJson)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, text().tooLarge)
    chunks.push(chunk)
  }
  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  }
  catch {
    throw new HttpError(400, text().invalidJson)
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, text().notObject)
  return body as Record<string, unknown>
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string') throw new HttpError(400, text().missingField(key))
  return value
}

export function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  if (value !== undefined && typeof value !== 'string') throw new HttpError(400, text().notString(key))
  return value
}

/** A workspace-relative path from a request; 400 when it leaves the workspace. */
export function requirePath(file: string): string {
  try {
    return workspacePath(file)
  }
  catch {
    throw new HttpError(400, text().outsideWorkspace(file))
  }
}
