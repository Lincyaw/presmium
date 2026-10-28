import { createContext, useContext, useLayoutEffect } from 'react'
import { getDefaultRegistry } from '@rjsf/core'
import type { FieldProps } from '@rjsf/utils'
import type { FieldPathList, SchemaFormContext } from './context.ts'

export const SchemaFormPath = createContext<{ path: FieldPathList, id?: string }>({ path: [] })
const NativeSchemaField = getDefaultRegistry().fields.SchemaField!

/** Public SchemaField props retain exact property names, including punctuation, without parsing DOM IDs. */
function SchemaField(props: FieldProps<unknown, any, SchemaFormContext>) {
  const parent = useContext(SchemaFormPath), id = props.idSchema.$id
  const path = parent.id === undefined || parent.id === id ? parent.path : [...parent.path, props.name]
  const context = props.registry.formContext
  useLayoutEffect(() => {
    context.paths.set(id, path); context.schemas.set(id, props.schema)
    return () => { if (context.schemas.get(id) === props.schema) { context.paths.delete(id); context.schemas.delete(id) } }
  }, [context, id, props.schema, JSON.stringify(path)])
  return <SchemaFormPath.Provider value={{ path, id }}><NativeSchemaField {...props} /></SchemaFormPath.Provider>
}
export const schemaFormFields = { SchemaField }
