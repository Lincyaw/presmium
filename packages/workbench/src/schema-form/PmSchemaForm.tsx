import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Form from '@rjsf/core'
import { createSchemaUtils } from '@rjsf/utils'
import type { RJSFSchema } from '@rjsf/utils'
import { validateDocumentParameters } from '@lincyaw/kernel'
import type { DocumentParameterValidation, JsonSchema, JsonValue } from '@lincyaw/kernel'
import { PmNotice } from '../components.tsx'
import type { ControlDensity } from '../components.tsx'
import { SCHEMA_FORM_MESSAGES } from './context.ts'
import type { FieldPathList, SchemaFormContext } from './context.ts'
import { schemaFormFields } from './fields.tsx'
import { schemaFormTemplates } from './templates.tsx'
import { schemaFormWidgets } from './widgets.tsx'
import { schemaFormValidator } from './validator.ts'

export interface PmSchemaFormProps {
  schema: JsonSchema
  value: JsonValue
  onChange(value: JsonValue, validation: DocumentParameterValidation): void
  onValidationChange?(validation: DocumentParameterValidation): void
  onComposition?(composing: boolean): void
  disabled?: boolean
  readOnly?: boolean
  density?: ControlDensity
  locale?: 'zh-CN' | 'en'
  label?: string
  error?: ReactNode
  extraValidation?(value: JsonValue): DocumentParameterValidation
  hideProperties?: readonly string[]
  empty?: ReactNode
  idPrefix?: string
}
const object = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const own = (value: unknown, key: string | number) => value !== null && typeof value === 'object' && Object.hasOwn(value, key)
const at = (value: unknown, path: FieldPathList): unknown => path.reduce((current: unknown, key) => own(current, key) ? (current as Record<string, unknown>)[key] : undefined, value)
// RJSF represents unanswered fields with undefined; the authoring value contains JSON only.
function jsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : jsonValue(item))
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, jsonValue(item)]))
  return value
}
function replace(value: JsonValue, path: FieldPathList, next: unknown): JsonValue {
  if (!path.length) return (next ?? null) as JsonValue
  const result = structuredClone(value), last = path.at(-1)!
  let parent: any = result
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]!
    if (!own(parent, key) || parent[key] === null || typeof parent[key] !== 'object') Object.defineProperty(parent, key, { value: typeof path[index + 1] === 'number' ? [] : {}, enumerable: true, configurable: true, writable: true })
    parent = parent[key]
  }
  if (next === undefined && !Array.isArray(parent)) delete parent[last]
  else Object.defineProperty(parent, last, { value: next === undefined ? null : structuredClone(next), enumerable: true, configurable: true, writable: true })
  return result
}

/** Remove data-producing annotations only from schema positions, never from authored data. */
function withoutDefaults(schema: JsonSchema): RJSFSchema {
  if (typeof schema === 'boolean') return { allOf: [schema] } as RJSFSchema
  const result = structuredClone(schema) as RJSFSchema
  delete result.default
  for (const key of ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'] as const) {
    const entries = result[key]
    if (object(entries)) result[key] = Object.fromEntries(Object.entries(entries).map(([name, child]) => [name, withoutDefaults(child)]))
  }
  for (const key of ['items', 'additionalProperties', 'additionalItems', 'contains', 'not', 'if', 'then', 'else', 'unevaluatedProperties', 'unevaluatedItems'] as const) {
    const child = result[key]
    if (typeof child === 'boolean' || object(child)) result[key] = withoutDefaults(child) as any
    else if (Array.isArray(child)) result[key] = child.map(withoutDefaults) as any
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) if (Array.isArray(result[key])) result[key] = result[key]!.map(withoutDefaults)
  return result
}

/** Top-level fields resolved through the same public schema utilities used by the form. */
export function schemaFormPropertyNames(schema: JsonSchema, value: JsonValue): { available: boolean, names: string[] } {
  try {
    const rendered = withoutDefaults(schema), validator = schemaFormValidator(rendered)
    const resolved = createSchemaUtils(validator, rendered).retrieveSchema(rendered, value)
    // A selector's uncommitted branch is UI state, so it cannot be inferred from the saved value.
    if (resolved.oneOf || resolved.anyOf) return { available: false, names: [] }
    return { available: true, names: Object.keys(resolved.properties ?? {}) }
  } catch { return { available: false, names: [] } }
}

/** Controlled parameter fields. The caller owns drafts, scope, persistence and adoption. */
export function PmSchemaForm({ schema, value, onChange, onValidationChange, onComposition, extraValidation, hideProperties = [], empty, idPrefix, disabled = false, readOnly = false, density = 'compact', locale = 'zh-CN', label, error }: PmSchemaFormProps) {
  const id = useId(), current = useRef({ schema, value, onChange, onValidationChange, onComposition, extraValidation, disabled, readOnly })
  current.current = { schema, value, onChange, onValidationChange, onComposition, extraValidation, disabled, readOnly }
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({}), [composing, setComposing] = useState(false)
  const composition = useRef(false)
  const reportedValidation = useRef<string>()
  const rendered = useMemo(() => withoutDefaults(schema), [schema]), validator = useMemo(() => schemaFormValidator(rendered), [rendered])
  const utilities = useMemo(() => createSchemaUtils(validator, rendered), [validator, rendered])
  const validate = (next: JsonValue) => {
    const base = validateDocumentParameters(current.current.schema, next), extra = current.current.extraValidation?.(next)
    return extra ? { available: base.available && extra.available, valid: base.valid && extra.valid, issues: [...base.issues, ...extra.issues] } : base
  }
  const validation = useMemo(() => validate(value), [schema, value, extraValidation])
  const context = useMemo<SchemaFormContext>(() => ({ density, messages: SCHEMA_FORM_MESSAGES[locale], paths: new Map(), schemas: new Map(),
    mark(control) {
      const branch = control.replace(/__(?:oneof|anyof)_select$/, '')
      this.intent = this.paths.get(control) ?? this.paths.get(branch)
      this.branch = branch !== control ? branch : undefined
    },
    inputError(control, message) { setInputErrors(errors => errors[control] === message || !message && !Object.hasOwn(errors, control) ? errors : message ? { ...errors, [control]: message } : Object.fromEntries(Object.entries(errors).filter(([key]) => key !== control))) },
    hideProperties: new Set(hideProperties), empty,
  }), [density, locale, JSON.stringify(hideProperties), empty])
  const result = useMemo<DocumentParameterValidation>(() => {
    const issues = [...validation.issues, ...Object.values(inputErrors).map(message => ({ path: '', keyword: 'input', message })), ...composing ? [{ path: '', keyword: 'composing', message: context.messages.composing }] : []]
    return { ...validation, valid: validation.valid && !issues.length, issues }
  }, [validation, inputErrors, composing, context.messages.composing])
  useEffect(() => {
    const serialized = JSON.stringify(result)
    if (!current.current.onValidationChange || serialized === reportedValidation.current) return
    reportedValidation.current = serialized
    current.current.onValidationChange(result)
  }, [result, onValidationChange])
  useEffect(() => () => { if (composition.current) current.current.onComposition?.(false) }, [])

  const preserve = (before: unknown, after: unknown, scope: RJSFSchema, depth = 0): unknown => {
    if (depth > 32) throw new Error('schema-form-depth')
    if (scope.readOnly) return structuredClone(before)
    if (!object(before) || !object(after)) return after
    const fields: Record<string, RJSFSchema> = {}
    const collect = (candidate: RJSFSchema, level: number) => {
      if (level > 32) throw new Error('schema-form-depth')
      const resolved = utilities.retrieveSchema(candidate, after)
      Object.assign(fields, resolved.properties)
      for (const key of ['allOf', 'oneOf', 'anyOf'] as const) for (const branch of resolved[key] ?? []) if (typeof branch !== 'boolean') collect(branch, level + 1)
    }
    collect(scope, depth)
    const merged = structuredClone(before)
    for (const [key, child] of Object.entries(fields)) {
      if (typeof child === 'boolean' || child.readOnly) continue
      if (!Object.hasOwn(after, key)) delete merged[key]
      else Object.defineProperty(merged, key, { value: preserve(before[key], after[key], child, depth + 1), enumerable: true, configurable: true, writable: true })
    }
    return merged
  }
  if (!validation.available) return <PmNotice tone="warn">{context.messages.unsupported}</PmNotice>
  return <div className="pm-ui-schema-form" data-density={density} role="group" aria-label={label}
    onCompositionStart={() => { composition.current = true; setComposing(true); current.current.onComposition?.(true) }}
    onCompositionEnd={() => { composition.current = false; setComposing(false); current.current.onComposition?.(false) }}>
    {error && <PmNotice tone="danger">{error}</PmNotice>}
    <Form schema={rendered} formData={value} validator={validator} widgets={schemaFormWidgets} templates={schemaFormTemplates} fields={schemaFormFields} formContext={context}
      idPrefix={idPrefix ?? `parameters-${id}`} tagName="div" noHtml5Validate showErrorList={false} liveValidate disabled={disabled} readonly={readOnly}
      experimental_defaultFormStateBehavior={{ emptyObjectFields: 'skipDefaults', arrayMinItems: { populate: 'never' }, constAsDefaults: 'never' }}
      uiSchema={{ 'ui:options': { expandable: false } }} onChange={event => {
        const latest = current.current, path = context.intent, branch = context.branch
        context.intent = undefined; context.branch = undefined
        if (!path || latest.disabled || latest.readOnly) return
        let next = jsonValue(at(event.formData, path))
        if (branch) {
          let scope = rendered, data: unknown = latest.value
          for (const key of path) {
            const resolved = utilities.retrieveSchema(scope, data)
            const child = Array.isArray(data) ? resolved.items : resolved.properties?.[key]
            if (!child || typeof child === 'boolean' || Array.isArray(child)) throw new Error('schema-form-target-unavailable')
            scope = child; data = own(data, key) ? (data as Record<string, unknown>)[key] : undefined
          }
          next = preserve(at(latest.value, path), next, scope)
        }
        const updated = replace(latest.value, path, next)
        const checked = validate(updated)
        latest.onChange(updated, composition.current ? { ...checked, valid: false, issues: [...checked.issues, { path: '', keyword: 'composing', message: context.messages.composing }] } : checked)
      }}><span /></Form>
  </div>
}
