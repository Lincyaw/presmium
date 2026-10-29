import { ProtocolError, ProtocolErrorCode, ResourceTemplate } from '@modelcontextprotocol/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { listBundledSkills, readBundledSkill, SkillError } from '@lincyaw/skills'
import type { ToolSpec } from './mcp.ts'

const SKILLS_URI = 'presmium://skills'
const FILE_TEMPLATE = `${SKILLS_URI}/{name}/{+path}`
const PAGE_LIMIT = 12000
const skillUri = (name: string, path = 'SKILL.md') => `${SKILLS_URI}/${encodeURIComponent(name)}/${path.split('/').map(encodeURIComponent).join('/')}`
const READ_ERRORS = ['skill-not-found', 'skill-path-invalid', 'skill-file-unavailable', 'skill-page-invalid', 'skill-unavailable'] as const

type SkillReadErrorCode = typeof READ_ERRORS[number]

class SkillReadError extends Error {
  readonly code: SkillReadErrorCode
  readonly status: number
  constructor(code: SkillReadErrorCode) {
    super(code)
    this.code = code
    this.status = code === 'skill-unavailable' ? 503 : code === 'skill-not-found' || code === 'skill-file-unavailable' ? 404 : 400
  }
}

function exposedError(error: unknown): SkillReadError {
  if (error instanceof SkillReadError) return error
  const code = error instanceof SkillError && READ_ERRORS.includes(error.code as SkillReadErrorCode) ? error.code as SkillReadErrorCode : 'skill-unavailable'
  return new SkillReadError(code)
}

function readSafely<T>(read: () => T): T {
  try { return read() } catch (error) { throw exposedError(error) }
}

function catalogue() {
  return readSafely(() => ({ skills: listBundledSkills().map(({ name, description, files, version, hash }) => ({ name, description, files, version, hash, uri: skillUri(name) })) }))
}

function skillFile(args: Record<string, unknown>) {
  return readSafely(() => readBundledSkill({
    name: String(args.name ?? ''),
    path: args.path === undefined ? 'SKILL.md' : String(args.path),
    offset: args.offset === undefined ? 0 : args.offset as number,
    limit: args.limit === undefined ? PAGE_LIMIT : args.limit as number,
  }))
}

export const SKILL_INSTRUCTIONS = 'Before creating or changing Presmium documents, animations, presentations or plugins, call list_skills and read the matching SKILL.md with read_skill. Read the referenced files needed for the task from that skill\'s listed relative paths. Follow nextOffset to finish a file and compare its version/hash across fragments; restart a read if they change. These bundled instructions are also resources at presmium://skills and presmium://skills/{name}/{+path}; file resources return the same bounded JSON text fragments and accept ?offset=<n>&limit=<n>. They are available without a document. The client decides when to read them; connecting does not install skills or load their full text into a prompt.'

export const SKILL_TOOLS: ToolSpec[] = [
  {
    name: 'list_skills',
    description: 'Lists the four bundled Presmium skills, their descriptions, relative resource files, version/hash and SKILL.md URI. Use this before Presmium authoring work; no document or compilation is required.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    kind: 'read',
    structured: true,
    run: async () => catalogue(),
  },
  {
    name: 'read_skill',
    description: 'Reads a bundled skill file as a bounded Unicode code-point text fragment. Start with SKILL.md, follow nextOffset until complete, then read the referenced relative files needed for the task. Only the four listed skills and their bundled files are readable; no document or compilation is required.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80, description: 'The exact skill name from list_skills.' },
        path: { type: 'string', minLength: 1, maxLength: 2048, default: 'SKILL.md', description: 'A bundled relative file path from list_skills; defaults to SKILL.md.' },
        offset: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0, description: 'Unicode code-point offset, initially zero; use the previous fragment\'s nextOffset.' },
        limit: { type: 'integer', minimum: 1, maximum: PAGE_LIMIT, default: PAGE_LIMIT, description: 'Maximum Unicode code points in this fragment.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    kind: 'read',
    structured: true,
    run: async ({ args }) => skillFile(args),
  },
]

function resourceArgs(url: URL): Record<string, unknown> {
  const query = url.searchParams
  if ([...query.keys()].some(key => !['offset', 'limit'].includes(key)) || ['offset', 'limit'].some(key => query.getAll(key).length > 1)) throw new SkillReadError('skill-page-invalid')
  const page: Record<string, number> = {}
  for (const key of ['offset', 'limit']) {
    const value = query.get(key)
    if (value === null) continue
    if (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new SkillReadError('skill-page-invalid')
    page[key] = Number(value)
  }
  try {
    const [, name = '', ...parts] = url.pathname.split('/')
    return { name: decodeURIComponent(name), path: decodeURIComponent(parts.join('/')), ...page }
  } catch { throw new SkillReadError('skill-path-invalid') }
}

/** Standard resources and ordinary read tools share the same bounded package reader. */
export function registerSkillResources(server: McpServer): void {
  const contents = (url: URL, read: () => unknown) => {
    try { return { contents: [{ uri: url.href, mimeType: 'application/json', text: JSON.stringify(read(), null, 2) }] } }
    catch (error) {
      const failure = exposedError(error)
      throw new ProtocolError(failure.status >= 500 ? ProtocolErrorCode.InternalError : ProtocolErrorCode.InvalidParams, failure.code)
    }
  }
  server.registerResource('skills', SKILLS_URI, { mimeType: 'application/json', description: 'The bundled Presmium skill catalogue, including relative files and SKILL.md resource URIs.' }, async url => contents(url, catalogue))
  server.registerResource('skill-file', new ResourceTemplate(FILE_TEMPLATE, {
    list: async () => ({ resources: catalogue().skills.map(skill => ({ name: `${skill.name}/SKILL.md`, uri: skill.uri, description: skill.description, mimeType: 'application/json' })) }),
  }), { mimeType: 'application/json', description: 'A bundled skill file as a versioned, bounded JSON text fragment; optional offset/limit query parameters page through it.' }, async url => contents(url, () => skillFile(resourceArgs(url))))
}
