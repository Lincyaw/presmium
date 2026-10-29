import { isRecord } from '@lincyaw/kernel'
import { parse as parseYaml } from 'yaml'

export function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

export function parseFrontmatter(text: string): Record<string, unknown> {
  const match = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(withoutBom(text))
  try {
    const data: unknown = match ? parseYaml(match[1] ?? '') : {}
    return isRecord(data) ? data : {}
  } catch {
    return {}
  }
}
