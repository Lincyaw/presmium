import type { Schema } from '@cfworker/json-schema'
import { Validator } from '@cfworker/json-schema'
import { PROJECT_APPLY_SCHEMA, PROJECT_PLAN_SCHEMA } from '../contracts/projects.ts'
import type { ProjectApply, ProjectPlanRequest } from '../contracts/projects.ts'
const plan = new Validator(structuredClone(PROJECT_PLAN_SCHEMA) as unknown as Schema, '2020-12', false), apply = new Validator(structuredClone(PROJECT_APPLY_SCHEMA) as unknown as Schema, '2020-12', false)
export const validateProjectPlan = (value: unknown): value is ProjectPlanRequest => plan.validate(value).valid
export const validateProjectApply = (value: unknown): value is ProjectApply => apply.validate(value).valid
