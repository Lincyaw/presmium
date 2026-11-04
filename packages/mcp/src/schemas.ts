import { isRecord } from '@lincyaw/kernel'

/** Retain the transitive definitions the advertised schema actually references. */
export function compactSchema(source: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(source.$defs)) return source
  const definitions = source.$defs
  const used = new Set<string>()
  let scoped = false
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!isRecord(value)) return
    if (typeof value.$ref === 'string') {
      if (value.$ref.startsWith('#/$defs/')) {
        const name = value.$ref.slice(8).split('/')[0]!.replaceAll('~1', '/').replaceAll('~0', '~')
        if (!used.has(name)) { used.add(name); visit(definitions[name]) }
      } else scoped = true
    }
    if ('$id' in value || '$anchor' in value || '$dynamicRef' in value || '$defs' in value) scoped = true
    Object.values(value).forEach(visit)
  }
  const { $defs: _definitions, ...root } = source
  visit(root)
  if (scoped) return source
  const retained = Object.fromEntries(Object.entries(definitions).filter(([name]) => used.has(name)))
  return used.size ? { ...root, $defs: retained } : root
}

/** A small, generated argument overview; a complete schema remains explicitly discoverable. */
export function schemaArguments(schema: Record<string, unknown>) {
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  return Object.fromEntries(Object.entries(isRecord(schema.properties) ? schema.properties : {}).map(([name, value]) => {
    const field = isRecord(value) ? value : {}
    return [name, { type: field.type ?? (field.oneOf ? 'union' : field.$ref ? String(field.$ref).split('/').at(-1) : 'value'),
      ...required.has(name) ? { required: true } : {}, ...field.enum ? { values: field.enum } : {},
      ...'const' in field ? { value: field.const } : {},
      ...typeof field.description === 'string' ? { description: field.description.slice(0, 160) } : {} }]
  }))
}
