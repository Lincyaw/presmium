import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { CHANGES_QUERY_SCHEMA, CHANGES_REQUEST_SCHEMA } from '../contracts/workspace-changes.ts'
import type { ChangesQuery, WorkspaceChangesRequest } from '../contracts/workspace-changes.ts'
const query = new Validator(CHANGES_QUERY_SCHEMA as unknown as Schema), change = new Validator(CHANGES_REQUEST_SCHEMA as unknown as Schema)
export const validateChangesQuery = (value: unknown): value is ChangesQuery => query.validate(value).valid
export const validateWorkspaceChangesRequest = (value: unknown): value is WorkspaceChangesRequest => change.validate(value).valid
