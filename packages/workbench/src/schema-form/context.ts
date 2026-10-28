import type { ControlDensity } from '../components.tsx'
import type { RJSFSchema } from '@rjsf/utils'
import type { ReactNode } from 'react'
import type { DocumentParameterAccess } from '@lincyaw/kernel'
export type FieldPathList = (string | number)[]

export interface SchemaFormMessages { empty: string, unsupported: string, yes: string, no: string, choose: string, add: string, remove: string, up: string, down: string, number: string, composing: string, access: string }
export const SCHEMA_FORM_MESSAGES: Record<'zh-CN' | 'en', SchemaFormMessages> = {
  'zh-CN': { empty: '无公开参数', unsupported: '此参数暂不支持表单编辑', yes: '是', no: '否', choose: '请选择', add: '添加', remove: '移除', up: '上移', down: '下移', number: '请输入有效数字', composing: '请完成输入', access: '此参数暂不可编辑' },
  en: { empty: 'No public parameters', unsupported: 'This parameter cannot be edited in this form', yes: 'Yes', no: 'No', choose: 'Choose', add: 'Add', remove: 'Remove', up: 'Move up', down: 'Move down', number: 'Enter a valid number', composing: 'Finish composing', access: 'This parameter is currently read-only' },
}
export interface SchemaFormContext {
  density: ControlDensity
  messages: SchemaFormMessages
  paths: Map<string, FieldPathList>
  schemas: Map<string, RJSFSchema>
  readOnly: Map<string, boolean>
  intent?: FieldPathList
  intentReadOnly?: boolean
  branch?: string
  mark(id: string): void
  inputError(id: string, error: string | undefined): void
  access(path: FieldPathList): DocumentParameterAccess
  hideProperties: ReadonlySet<string>
  empty?: ReactNode
}
