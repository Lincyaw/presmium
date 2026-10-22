import { isRecord } from './errors.ts'

/** Sets the value at a dotted path, copying the objects on the way. */
export function withProp(props: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [key = '', ...rest] = path.split('.')
  if (rest.length === 0) return { ...props, [key]: value }
  const inner = props[key]
  return { ...props, [key]: withProp(isRecord(inner) ? inner : {}, rest.join('.'), value) }
}

/** Every string in a component's props, nested arrays and objects included. */
export function propText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(propText)
  if (value && typeof value === 'object') return Object.values(value).flatMap(propText)
  return []
}
