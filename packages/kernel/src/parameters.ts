import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { compileSchema, draft2020 } from 'json-schema-library'
import type { JsonSchema } from './contracts/document.ts'

export interface DocumentParameterIssue {
  /** RFC 6901 pointer into the parameter value; the empty string denotes its root. */
  path: string
  keyword: string
  message: string
  schemaPath?: string
}
export interface DocumentParameterValidation { available: boolean, valid: boolean, issues: DocumentParameterIssue[] }
export interface DocumentParameterSchemaReference { id: string, schema: JsonSchema }
export interface DocumentParameterAccess { available: boolean, public: boolean, readOnly: boolean, reason?: 'invalid-path' | 'schema-unavailable' | 'path-unavailable' | 'value-unresolved' }

/** A private annotation view: false cannot cancel another applicable true; author JSON is untouched. */
export function documentParameterSchemaForAccess(schema: JsonSchema): JsonSchema {
  const result = structuredClone(schema)
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  let visited = 0
  const visit = (node: unknown, depth: number) => {
    if (!object(node)) return
    if (depth > 64 || ++visited > 50_000) throw new Error('parameter-schema-limit')
    if (node.readOnly === false) delete node.readOnly
    for (const key of ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas']) {
      const children = node[key]
      if (object(children)) for (const child of Object.values(children)) visit(child, depth + 1)
    }
    if (object(node.dependencies)) for (const child of Object.values(node.dependencies)) if (!Array.isArray(child)) visit(child, depth + 1)
    for (const key of ['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'contentSchema']) {
      const child = node[key]
      if (Array.isArray(child)) for (const item of child) visit(item, depth + 1)
      else visit(child, depth + 1)
    }
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) if (Array.isArray(node[key])) for (const child of node[key]) visit(child, depth + 1)
  }
  visit(result, 0)
  return result
}

/** Schema-declared path and applicable read-only ancestors; never infers fields from data. */
export function documentParameterAccess(schema: JsonSchema, value: unknown, path: readonly (string | number)[]): DocumentParameterAccess {
  if (path.length > 64 || path.some(key => typeof key !== 'string' && (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0))) return { available: false, public: false, readOnly: false, reason: 'invalid-path' }
  let readOnly = false
  try {
    // Only the bundled 2020-12 draft and this local schema are registered. No remote loader.
    const root = compileSchema(documentParameterSchemaForAccess(schema), { drafts: [draft2020], draft: 'draft-2020-12', throwOnInvalidSchema: true, throwOnInvalidRef: true })
    const reason = (error: { code: unknown }): 'path-unavailable' | 'value-unresolved' => typeof error.code === 'string' && ['one-of-error', 'any-of-error'].includes(error.code) ? 'value-unresolved' : 'path-unavailable'
    let pointer = '', current = value
    for (let index = 0; index <= path.length; index++) {
      const found = root.getNode(pointer, value, { createSchema: false })
      if (found.error) return { available: false, public: false, readOnly, reason: reason(found.error) }
      if (!found.node) return { available: true, public: false, readOnly }
      if (typeof found.node.schema === 'object' && found.node.schema.readOnly === true) readOnly = true
      const reduced = found.node.reduceNode(current)
      if (reduced.error) return { available: false, public: false, readOnly, reason: reason(reduced.error) }
      if (!reduced.node) return { available: false, public: false, readOnly, reason: 'path-unavailable' }
      if (typeof reduced.node.schema === 'object' && reduced.node.schema.readOnly === true) readOnly = true
      if (index === path.length) return { available: true, public: true, readOnly }
      const key = path[index]!
      pointer += `/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`
      current = current !== null && typeof current === 'object' && Object.hasOwn(current, key) ? (current as Record<string | number, unknown>)[key] : undefined
    }
  } catch { return { available: false, public: false, readOnly, reason: 'schema-unavailable' } }
  return { available: false, public: false, readOnly, reason: 'path-unavailable' }
}

/** The canonical validator and public form adapter share the same dialect and reference resolver. */
export function validateDocumentParameters(schema: JsonSchema, value: unknown, references: readonly DocumentParameterSchemaReference[] = []): DocumentParameterValidation {
  try {
    const validator = new Validator(structuredClone(schema) as Schema, '2020-12', false)
    for (const reference of references) validator.addSchema(structuredClone(typeof reference.schema === 'boolean' ? { allOf: [reference.schema] } : reference.schema) as Schema, reference.id)
    const result = validator.validate(value)
    return { available: true, valid: result.valid, issues: result.errors.slice(0, 10).map(error => ({
      path: error.instanceLocation.replace(/^#/, ''), keyword: error.keyword, message: error.error, schemaPath: error.keywordLocation,
    })) }
  } catch (error) {
    return { available: false, valid: false, issues: [{ path: '', keyword: 'schema-unavailable', message: error instanceof Error ? error.message : 'This parameter schema cannot be validated.' }] }
  }
}
