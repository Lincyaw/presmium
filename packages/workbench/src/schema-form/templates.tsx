import { useContext } from 'react'
import type { FormProps } from '@rjsf/core'
import type { ArrayFieldItemButtonsTemplateProps, ArrayFieldItemTemplateProps, ArrayFieldTemplateProps, FieldTemplateProps, ObjectFieldTemplateProps } from '@rjsf/utils'
import { PmButton, PmField, PmIconButton, PmNotice } from '../components.tsx'
import type { SchemaFormContext } from './context.ts'
import { declaredSchemaProperties, SchemaFormPath, SchemaFormUnionFields } from './fields.tsx'

function Field(props: FieldTemplateProps<unknown, any, SchemaFormContext>) {
  if (props.hidden) return null
  return <div className="pm-ui-schema-form__field">{props.children}{(props.schema.type === 'object' || props.schema.type === 'array') && props.rawErrors?.length ? <PmNotice tone="danger">{props.rawErrors.join(' · ')}</PmNotice> : null}</div>
}
function ObjectFields(props: ObjectFieldTemplateProps<unknown, any, SchemaFormContext>) {
  const declared = new Set(declaredSchemaProperties(props.schema))
  const fields = props.properties.filter(property => declared.has(property.name))
  const scope = useContext(SchemaFormPath), context = props.registry.formContext
  const unions = useContext(SchemaFormUnionFields)
  const duplicate = (name: string) => unions.some(union => union.id === props.fieldPathId.$id && union.names.has(name))
  const shown = fields.filter(property => !duplicate(property.name) && (scope.path.length || !context.hideProperties.has(property.name)))
  if (scope.path.length && !fields.length && !props.schema.oneOf && !props.schema.anyOf) return null
  if (fields.length && fields.every(property => duplicate(property.name))) return null
  const children = shown.length ? <div className="pm-ui-schema-form__fields">{shown.map(property => <div key={property.name}>{property.content}</div>)}</div>
    : props.schema.oneOf || props.schema.anyOf ? null : context.empty === undefined ? <span>{context.messages.empty}</span> : context.empty
  return props.title ? <PmField label={props.title} group density={props.registry.formContext.density}>{children}</PmField> : children
}
function ArrayFields(props: ArrayFieldTemplateProps<unknown, any, SchemaFormContext>) {
  const context = props.registry.formContext
  return <PmField label={props.title} group density={context.density}><div className="pm-ui-schema-form__fields">{props.items}</div>
    {props.canAdd && <PmButton small icon="plus" disabled={props.disabled || props.readonly} onClick={event => { context.intent = props.fieldPathId.path; context.intentReadOnly = Boolean(props.disabled || props.readonly); props.onAddClick(event) }}>{context.messages.add}</PmButton>}
  </PmField>
}
function ArrayButtons(props: ArrayFieldItemButtonsTemplateProps<unknown, any, SchemaFormContext>) {
  const context = props.registry.formContext
  const invoke = (action: (event: unknown) => void, event: unknown) => { context.intent = props.fieldPathId.path.slice(0, -1); context.intentReadOnly = Boolean(props.disabled || props.readonly); action(event) }
  return <div className="pm-ui-schema-form__actions">
    {props.hasMoveUp && <PmButton small disabled={props.disabled || props.readonly} onClick={event => invoke(props.onMoveUpItem, event)}>{context.messages.up}</PmButton>}
    {props.hasMoveDown && <PmButton small disabled={props.disabled || props.readonly} onClick={event => invoke(props.onMoveDownItem, event)}>{context.messages.down}</PmButton>}
    {props.hasRemove && <PmIconButton small icon="trash" label={context.messages.remove} disabled={props.disabled || props.readonly} onClick={event => invoke(props.onRemoveItem, event)} />}
  </div>
}
function ArrayItem(props: ArrayFieldItemTemplateProps<unknown, any, SchemaFormContext>) {
  return <div className="pm-ui-schema-form__item"><div className="pm-ui-schema-form__field">{props.children}</div>{props.hasToolbar && <ArrayButtons {...props.buttonsProps} />}</div>
}

export const schemaFormTemplates: NonNullable<FormProps['templates']> = {
  FieldTemplate: Field, ObjectFieldTemplate: ObjectFields, ArrayFieldTemplate: ArrayFields,
  ArrayFieldItemTemplate: ArrayItem, ArrayFieldItemButtonsTemplate: ArrayButtons,
  WrapIfAdditionalTemplate: () => null, ErrorListTemplate: () => null,
  UnsupportedFieldTemplate: props => <PmNotice>{props.registry.formContext.messages.unsupported}</PmNotice>,
  ButtonTemplates: { SubmitButton: () => null },
}
