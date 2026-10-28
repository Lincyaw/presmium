import { useContext } from 'react'
import type { FormProps } from '@rjsf/core'
import type { ArrayFieldTemplateProps, FieldTemplateProps, ObjectFieldTemplateProps } from '@rjsf/utils'
import { PmButton, PmField, PmIconButton, PmNotice } from '../components.tsx'
import type { SchemaFormContext } from './context.ts'
import { SchemaFormPath } from './fields.tsx'

function Field(props: FieldTemplateProps<unknown, any, SchemaFormContext>) {
  if (props.hidden) return null
  return <div className="pm-ui-schema-form__field">{props.children}{(props.schema.type === 'object' || props.schema.type === 'array') && props.rawErrors?.length ? <PmNotice tone="danger">{props.rawErrors.join(' · ')}</PmNotice> : null}</div>
}
function ObjectFields(props: ObjectFieldTemplateProps<unknown, any, SchemaFormContext>) {
  const fields = props.properties.filter(property => Object.hasOwn(props.schema.properties ?? {}, property.name))
  const scope = useContext(SchemaFormPath), context = props.registry.formContext
  const shown = fields.filter(property => scope.path.length || !context.hideProperties.has(property.name))
  const children = shown.length ? <div className="pm-ui-schema-form__fields">{shown.map(property => <div key={property.name}>{property.content}</div>)}</div>
    : props.schema.oneOf || props.schema.anyOf ? null : context.empty === undefined ? <span>{context.messages.empty}</span> : context.empty
  return props.title ? <PmField label={props.title} group density={props.registry.formContext.density}>{children}</PmField> : children
}
function ArrayFields(props: ArrayFieldTemplateProps<unknown, any, SchemaFormContext>) {
  const context = props.registry.formContext
  const scope = useContext(SchemaFormPath)
  const invoke = (action: (event?: unknown) => void, event: unknown) => { context.intent = scope.path; context.intentReadOnly = Boolean(props.disabled || props.readonly); action(event) }
  return <PmField label={props.title} group density={context.density}><div className="pm-ui-schema-form__fields">{props.items.map(item => <div key={item.key} className="pm-ui-schema-form__item">
    <div className="pm-ui-schema-form__field"><SchemaFormPath.Provider value={{ path: [...scope.path, item.index] }}>{item.children}</SchemaFormPath.Provider></div>
    {item.hasToolbar && <div className="pm-ui-schema-form__actions">
      {item.hasMoveUp && <PmButton small disabled={props.disabled || props.readonly} onClick={event => invoke(item.onReorderClick(item.index, item.index - 1), event)}>{context.messages.up}</PmButton>}
      {item.hasMoveDown && <PmButton small disabled={props.disabled || props.readonly} onClick={event => invoke(item.onReorderClick(item.index, item.index + 1), event)}>{context.messages.down}</PmButton>}
      {item.hasRemove && <PmIconButton small icon="trash" label={context.messages.remove} disabled={props.disabled || props.readonly} onClick={event => invoke(item.onDropIndexClick(item.index), event)} />}
    </div>}
  </div>)}</div>
    {props.canAdd && <PmButton small icon="plus" disabled={props.disabled || props.readonly} onClick={event => invoke(props.onAddClick, event)}>{context.messages.add}</PmButton>}
  </PmField>
}

export const schemaFormTemplates: NonNullable<FormProps['templates']> = {
  FieldTemplate: Field, ObjectFieldTemplate: ObjectFields, ArrayFieldTemplate: ArrayFields,
  WrapIfAdditionalTemplate: () => null, ErrorListTemplate: () => null,
  UnsupportedFieldTemplate: props => <PmNotice>{props.registry.formContext.messages.unsupported}</PmNotice>,
  ButtonTemplates: { SubmitButton: () => null },
}
