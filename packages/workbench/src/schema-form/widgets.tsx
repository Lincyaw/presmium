import { useEffect, useState } from 'react'
import type { WidgetProps } from '@rjsf/utils'
import { PmField, PmInput, PmNotice, PmSegmented, PmSelect, PmTextarea } from '../components.tsx'
import type { SchemaFormContext } from './context.ts'

type Props = WidgetProps<unknown, any, SchemaFormContext>
const feedback = (props: Props) => props.rawErrors?.join(' · ')
const change = (props: Props, value: unknown) => { if (!props.disabled && !props.readonly) { props.registry.formContext.mark(props.id); props.onChange(value) } }

function Input(props: Props) {
  const { id, value, schema, disabled, readonly, label, placeholder, registry, onBlur, onFocus } = props
  const numeric = schema.type === 'number' || schema.type === 'integer'
  const [draft, setDraft] = useState<string>(), [invalid, setInvalid] = useState(false)
  useEffect(() => { setDraft(undefined); setInvalid(false); registry.formContext.inputError(id, undefined) }, [value])
  useEffect(() => () => registry.formContext.inputError(id, undefined), [id])
  return <PmInput id={id} label={label} value={draft ?? (value === undefined || value === null ? '' : String(value))} placeholder={placeholder}
    disabled={disabled} readOnly={readonly} density={registry.formContext.density} inputMode={numeric ? 'decimal' : undefined} width={numeric ? 'number' : undefined}
    error={invalid ? registry.formContext.messages.number : feedback(props)} hint={schema.description}
    onFocus={() => onFocus(id, value)} onBlur={() => onBlur(id, value)} onChange={event => {
      if (disabled || readonly) return
      const text = event.currentTarget.value
      if (!numeric) { change(props, text); return }
      setDraft(text)
      const number = Number(text), valid = text === '' || /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text) && Number.isFinite(number)
      setInvalid(!valid); registry.formContext.inputError(id, valid ? undefined : registry.formContext.messages.number)
      change(props, !valid ? text : text === '' ? undefined : number)
    }} />
}

function Select(props: Props) {
  const { id, label, value, options, disabled, readonly, registry } = props
  const choices = options.enumOptions ?? []
  const selected = choices.findIndex(option => JSON.stringify(option.value) === JSON.stringify(value))
  if (props.multiple) return <PmNotice>{registry.formContext.messages.unsupported}</PmNotice>
  return <PmSelect id={id} label={label} value={selected < 0 ? '' : String(selected)} disabled={disabled || readonly} density={registry.formContext.density}
    error={feedback(props)} onBlur={() => props.onBlur(id, value)} onFocus={() => props.onFocus(id, value)} onChange={event => {
      const option = choices[Number(event.currentTarget.value)]
      if (option) change(props, option.value)
    }}><option value="">{registry.formContext.messages.choose}</option>{choices.map((option, index) => <option key={index} value={index}>{option.label}</option>)}</PmSelect>
}

function Boolean(props: Props) {
  const context = props.registry.formContext
  return <PmField label={props.label} group error={feedback(props)} density={context.density}>
    <PmSegmented label={props.label} value={typeof props.value === 'boolean' ? String(props.value) : ''} options={[{ value: 'true', label: context.messages.yes }, { value: 'false', label: context.messages.no }]}
      disabled={props.disabled || props.readonly} density={context.density} onChange={value => change(props, value === 'true')} />
  </PmField>
}
function Textarea(props: Props) {
  return <PmTextarea id={props.id} label={props.label} value={props.value ?? ''} disabled={props.disabled} readOnly={props.readonly} density={props.registry.formContext.density}
    error={feedback(props)} onChange={event => change(props, event.currentTarget.value)} />
}
function Unsupported(props: Props) { return <PmNotice>{props.registry.formContext.messages.unsupported}</PmNotice> }

export const schemaFormWidgets = {
  TextWidget: Input, UpDownWidget: Input, EmailWidget: Input, URLWidget: Input, PasswordWidget: Input,
  DateWidget: Input, DateTimeWidget: Input, TimeWidget: Input, ColorWidget: Input, RangeWidget: Input,
  TextareaWidget: Textarea, SelectWidget: Select, RadioWidget: Select, CheckboxWidget: Boolean,
  CheckboxesWidget: Unsupported, FileWidget: Unsupported, HiddenWidget: Unsupported,
}
