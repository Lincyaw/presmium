import { Validator } from '@cfworker/json-schema'
import { AUTHORING_CLIENT_ACK_SCHEMA, AUTHORING_CLIENT_CONNECTION_SCHEMA, AUTHORING_CLIENT_OPEN_SCHEMA, AUTHORING_CLIENT_QUERY_SCHEMA, AUTHORING_CLIENT_REPORT_SCHEMA, AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA, AUTHORING_CLIENT_REQUEST_SCHEMA } from '../contracts/authoring-clients.ts'
import type { AuthoringClientAcknowledgement, AuthoringClientLease, AuthoringClientOpen, AuthoringClientReport, AuthoringClientRequest } from '../contracts/authoring-clients.ts'

const validator = (schema: typeof AUTHORING_CLIENT_REQUEST_SCHEMA) => new Validator(structuredClone(schema), '2020-12', false)
const request = validator(AUTHORING_CLIENT_REQUEST_SCHEMA), query = validator(AUTHORING_CLIENT_QUERY_SCHEMA), get = validator(AUTHORING_CLIENT_REQUEST_QUERY_SCHEMA)
const open = validator(AUTHORING_CLIENT_OPEN_SCHEMA), report = validator(AUTHORING_CLIENT_REPORT_SCHEMA), ack = validator(AUTHORING_CLIENT_ACK_SCHEMA), connection = validator(AUTHORING_CLIENT_CONNECTION_SCHEMA)
export const validateAuthoringClientRequest = (value: unknown): value is AuthoringClientRequest => request.validate(value).valid
export const validateAuthoringClientQuery = (value: unknown): value is { clientId?: string, after?: string } => query.validate(value).valid
export const validateAuthoringClientRequestQuery = (value: unknown): value is { clientId: string, epoch: string, requestId: string } => get.validate(value).valid
export const validateAuthoringClientOpen = (value: unknown): value is AuthoringClientOpen => open.validate(value).valid
export const validateAuthoringClientReport = (value: unknown): value is AuthoringClientReport => report.validate(value).valid
export const validateAuthoringClientAcknowledgement = (value: unknown): value is AuthoringClientAcknowledgement => ack.validate(value).valid
export const validateAuthoringClientLease = (value: unknown): value is AuthoringClientLease => connection.validate(value).valid
