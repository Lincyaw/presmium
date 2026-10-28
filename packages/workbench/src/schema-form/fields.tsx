import { createContext, useContext, useLayoutEffect } from 'react'
import { getDefaultRegistry } from '@rjsf/core'
import { ADDITIONAL_PROPERTY_FLAG, getDiscriminatorFieldFromSchema, getOptionMatchingSimpleDiscriminator } from '@rjsf/utils'
import type { FieldProps, RJSFMarkedSchema, RJSFSchema } from '@rjsf/utils'
import type { FieldPathList, SchemaFormContext } from './context.ts'
import { PmNotice } from '../components.tsx'

export const SchemaFormPath = createContext<{ path: FieldPathList, id?: string }>({ path: [] })
export const SchemaFormUnionFields = createContext<readonly { id: string, names: ReadonlySet<string> }[]>([])
const native = getDefaultRegistry().fields, NativeSchemaField = native.SchemaField!

/** The public marker distinguishes authored fields from properties inferred from additional data. */
export function declaredSchemaProperties(schema: RJSFSchema): string[] {
  return Object.entries(schema.properties ?? {}).filter(([, child]) => typeof child === 'boolean' || !(child as RJSFMarkedSchema)[ADDITIONAL_PROPERTY_FLAG]).map(([name]) => name)
}

/** Public SchemaField props retain exact property names, including punctuation, without parsing DOM IDs. */
function SchemaField(props: FieldProps<unknown, any, SchemaFormContext>) {
  const id = props.fieldPathId.$id, path = props.fieldPathId.path
  const context = props.registry.formContext
  const access = context.access(path), blocked = !access.available || !access.public
  const hidden = Boolean((props.schema as RJSFMarkedSchema)[ADDITIONAL_PROPERTY_FLAG] || access.available && !access.public)
  const readonly = Boolean(props.readonly || props.schema.readOnly || access.readOnly || blocked)
  useLayoutEffect(() => {
    if (hidden) return
    context.paths.set(id, path); context.schemas.set(id, props.schema); context.readOnly.set(id, readonly)
    return () => { if (context.schemas.get(id) === props.schema) { context.paths.delete(id); context.schemas.delete(id); context.readOnly.delete(id) } }
  }, [context, id, props.schema, readonly, hidden, JSON.stringify(path)])
  if (hidden) return null
  return <SchemaFormPath.Provider value={{ path, id }}>{blocked && !props.readonly && <PmNotice>{context.messages.access}</PmNotice>}<NativeSchemaField {...props} readonly={readonly} /></SchemaFormPath.Provider>
}

/** Keep native branch state; omit only fields already rendered outside this exact union scope. */
function unionField(Native: typeof NativeSchemaField) {
  return function UnionField(props: FieldProps<unknown, any, SchemaFormContext>) {
    const inherited = useContext(SchemaFormUnionFields)
    let names: string[], supported = false
    try {
      const { schemaUtils, formContext } = props.registry, resolved = schemaUtils.retrieveSchema(props.schema, props.formData)
      names = declaredSchemaProperties(resolved)
      const selector = getDiscriminatorFieldFromSchema(props.schema)
      const options = (props.options as RJSFSchema[]).map(option => schemaUtils.retrieveSchema(option, props.formData))
      if (selector && options.length) {
        const values = options.map(option => {
          const property = option.properties?.[selector]
          if (!property || typeof property === 'boolean' || !option.required?.includes(selector)) return undefined
          const marker = schemaUtils.retrieveSchema(property, (props.formData as Record<string, unknown> | undefined)?.[selector])
          if (!Object.hasOwn(marker, 'const') || marker.readOnly || marker.const !== null && !['string', 'number', 'boolean'].includes(typeof marker.const) || typeof marker.const === 'number' && !Number.isFinite(marker.const)) return undefined
          return JSON.stringify(marker.const)
        })
        const access = formContext.access([...props.fieldPathId.path, selector])
        supported = values.every(value => value !== undefined) && new Set(values).size === options.length && getOptionMatchingSimpleDiscriminator(props.formData, options, selector) !== undefined && access.available && access.public && !access.readOnly
      }
    }
    catch { return <PmNotice>{props.registry.formContext.messages.unsupported}</PmNotice> }
    return <SchemaFormUnionFields.Provider value={[...inherited, { id: props.fieldPathId.$id, names: new Set(names) }]}>{!supported && !props.readonly && <PmNotice>{props.registry.formContext.messages.union}</PmNotice>}<Native {...props} readonly={props.readonly || !supported} /></SchemaFormUnionFields.Provider>
  }
}
export const schemaFormFields = { SchemaField, AnyOfField: unionField(native.AnyOfField!), OneOfField: unionField(native.OneOfField!) }
