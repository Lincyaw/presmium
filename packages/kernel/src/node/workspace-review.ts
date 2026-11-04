import { Validator } from '@cfworker/json-schema'
import type { Schema } from '@cfworker/json-schema'
import { WORKSPACE_REVIEW_CHANGE_SCHEMA, WORKSPACE_REVIEW_QUERY_SCHEMA } from '../contracts/workspace-review.ts'
import type { WorkspaceReviewChange, WorkspaceReviewQuery } from '../contracts/workspace-review.ts'

const query = new Validator(WORKSPACE_REVIEW_QUERY_SCHEMA as unknown as Schema)
const change = new Validator(WORKSPACE_REVIEW_CHANGE_SCHEMA as unknown as Schema)
export const validateWorkspaceReviewQuery = (value: unknown): value is WorkspaceReviewQuery => query.validate(value).valid
export const validateWorkspaceReviewChange = (value: unknown): value is WorkspaceReviewChange => change.validate(value).valid
