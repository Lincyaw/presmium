import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
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
