import { Validator } from '@cfworker/json-schema'
import { AUTHORING_WINDOW_ACK_SCHEMA, AUTHORING_WINDOW_HANDLE_SCHEMA, AUTHORING_WINDOW_OPEN_SCHEMA, AUTHORING_WINDOW_REPORT_SCHEMA, AUTHORING_WINDOW_REQUEST_SCHEMA } from '../contracts/authoring-windows.ts'
import type { AuthoringWindowAcknowledgement, AuthoringWindowOpen, AuthoringWindowReport, AuthoringWindowRequest } from '../contracts/authoring-windows.ts'
const validator = (schema: typeof AUTHORING_WINDOW_REQUEST_SCHEMA) => new Validator(structuredClone(schema), '2020-12', false)
const request = validator(AUTHORING_WINDOW_REQUEST_SCHEMA), open = validator(AUTHORING_WINDOW_OPEN_SCHEMA), report = validator(AUTHORING_WINDOW_REPORT_SCHEMA), ack = validator(AUTHORING_WINDOW_ACK_SCHEMA)
const handle = validator(AUTHORING_WINDOW_HANDLE_SCHEMA)
export const validateAuthoringWindowHandle = (value: unknown): value is string => handle.validate(value).valid
export const validateAuthoringWindowRequest = (value: unknown): value is AuthoringWindowRequest => request.validate(value).valid
export const validateAuthoringWindowOpen = (value: unknown): value is AuthoringWindowOpen => open.validate(value).valid
export const validateAuthoringWindowReport = (value: unknown): value is AuthoringWindowReport => report.validate(value).valid
export const validateAuthoringWindowAcknowledgement = (value: unknown): value is AuthoringWindowAcknowledgement => ack.validate(value).valid
