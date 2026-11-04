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

/** A discriminator is useful only when every branch requires a different string literal. */
function discriminator(schema: Record<string, unknown>): { field: string, values: string[], branches: Record<string, unknown>[] } | undefined {
  if (!Array.isArray(schema.oneOf) || !schema.oneOf.length || !schema.oneOf.every(branch => isRecord(branch) && (branch.type === 'object' || schema.type === 'object'))) return
  const branches = schema.oneOf as Record<string, unknown>[], first = branches[0]!
  for (const field of Object.keys(isRecord(first.properties) ? first.properties : {})) {
    const values = branches.map(branch => {
      const value = isRecord(branch.properties) ? branch.properties[field] : undefined
      return Array.isArray(branch.required) && branch.required.includes(field) && isRecord(value) && typeof value.const === 'string' ? value.const : undefined
    })
    if (values.every((value): value is string => value !== undefined) && new Set(values).size === values.length) return { field, values, branches }
  }
}

interface VariantLocation { path: string[], union: NonNullable<ReturnType<typeof discriminator>> }
function variantLocations(schema: Record<string, unknown>, path: string[] = []): VariantLocation[] {
  const union = discriminator(schema)
  return [...union ? [{ path, union }] : [], ...Object.entries(isRecord(schema.properties) ? schema.properties : {})
    .flatMap(([name, value]) => isRecord(value) ? variantLocations(value, [...path, name]) : [])]
}

/** Discovery narrows an object parameter's discriminated union; execution validates the original. */
export function selectSchemaVariant(schema: Record<string, unknown>, variant: string): Record<string, unknown> {
  const candidates = variantLocations(schema).flatMap(location => {
    const index = location.union.values.indexOf(variant)
    return index >= 0 ? [{ ...location, branch: location.union.branches[index]! }] : []
  })
  if (candidates.length !== 1) throw Object.assign(new Error(candidates.length ? 'operation-variant-ambiguous' : 'operation-variant-unavailable'), { status: 400 })
  // Moving oneOf entries preserves root $defs references, but not index/anchor/resource references.
  const checkReferences = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(checkReferences); return }
    if (!isRecord(value)) return
    if (['$id', '$anchor', '$dynamicAnchor', '$dynamicRef', '$recursiveAnchor', '$recursiveRef'].some(key => key in value)
      || '$ref' in value && (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/$defs/'))) throw Object.assign(new Error('operation-variant-schema-unsupported'), { status: 400 })
    Object.values(value).forEach(checkReferences)
  }
  checkReferences(schema)
  const selected = candidates[0]!
  const replace = (value: Record<string, unknown>, path: string[]): Record<string, unknown> => {
    if (!path.length) return { ...value, oneOf: [selected.branch] }
    const [name, ...rest] = path, properties = value.properties as Record<string, Record<string, unknown>>
    return { ...value, properties: { ...properties, [name!]: replace(properties[name!]!, rest) } }
  }
  return compactSchema(replace(schema, selected.path))
}

/** A small, generated argument overview; a complete schema remains explicitly discoverable. */
export function schemaArguments(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  const fields: Record<string, Record<string, unknown>> = Object.fromEntries(Object.entries(isRecord(schema.properties) ? schema.properties : {}).map(([name, value]) => {
    const field = isRecord(value) ? value : {}, union = discriminator(field)
    return [name, { type: field.type ?? (typeof field.const === 'string' ? 'string' : union?.branches.length === 1 ? 'object' : field.oneOf ? 'union' : field.$ref ? String(field.$ref).split('/').at(-1) : 'value'),
      ...required.has(name) ? { required: true } : {}, ...field.enum ? { values: field.enum } : {},
      ...'const' in field ? { value: field.const } : {},
      ...union ? union.branches.length === 1 ? { arguments: schemaArguments(field) } : { variants: { field: union.field, values: union.values } }
        : variantLocations(field).length ? { arguments: schemaArguments(field) } : {},
      ...typeof field.description === 'string' ? { description: field.description.slice(0, 160) } : {} }]
  }))
  for (const name of required) if (typeof name === 'string') fields[name] = { ...fields[name], required: true }
  const union = discriminator(schema)
  if (union?.branches.length === 1) {
    for (const [name, field] of Object.entries(schemaArguments(union.branches[0]!))) fields[name] = { ...fields[name], ...field }
    return fields
  }
  return union ? { ...fields, [union.field]: { type: 'string', required: true, values: union.values } } : fields
}
