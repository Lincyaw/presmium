import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { SOURCE_EDIT_SCHEMA, SOURCE_LIST_SCHEMA, SOURCE_READ_SCHEMA } from '../contracts/workspace-source.ts'
import type { SourceEdit, SourceListQuery, SourceReadQuery } from '../contracts/workspace-source.ts'
const list = new Validator(SOURCE_LIST_SCHEMA as unknown as Schema)
const read = new Validator(SOURCE_READ_SCHEMA as unknown as Schema)
const edit = new Validator(SOURCE_EDIT_SCHEMA as unknown as Schema)
export const validateSourceList = (value: unknown): value is SourceListQuery => list.validate(value).valid
export const validateSourceRead = (value: unknown): value is SourceReadQuery => read.validate(value).valid
export const validateSourceEdit = (value: unknown): value is SourceEdit => edit.validate(value).valid
