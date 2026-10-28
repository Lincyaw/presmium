import { validateDocumentParameters } from '@lincyaw/kernel'
import type { DocumentParameterValidation, JsonSchema } from '@lincyaw/kernel'
import { createErrorHandler, ErrorSchemaBuilder, ROOT_SCHEMA_PREFIX, toErrorList, unwrapErrorHandler, validationDataMerge, withIdRefPrefix } from '@rjsf/utils'
import type { RJSFSchema, RJSFValidationError, ValidatorType } from '@rjsf/utils'

const pathOf = (pointer: string) => pointer ? pointer.slice(1).split('/').map(value => value.replaceAll('~1', '/').replaceAll('~0', '~')) : []

/** RJSF owns field discovery; CFworker remains the canonical validation implementation. */
export function schemaFormValidator(root: RJSFSchema): ValidatorType {
  const validate = (schema: RJSFSchema, data: unknown, rootSchema = root): DocumentParameterValidation => {
    if (schema === rootSchema) return validateDocumentParameters(schema as JsonSchema, data)
    const fragment = withIdRefPrefix(schema) as RJSFSchema
    // RJSF's fragment refs point at the registered root, not the fragment's original resource ID.
    delete fragment.$id
    return validateDocumentParameters(fragment as JsonSchema, data, [{ id: ROOT_SCHEMA_PREFIX, schema: rootSchema as JsonSchema }])
  }
  return {
    toErrorList,
    rawValidation<Result>(schema: RJSFSchema, data?: unknown) {
      const result = validate(schema, data)
      return result.available ? { errors: result.issues as Result[] } : { validationError: new Error(result.issues[0]?.message) }
    },
    isValid: (schema, data, rootSchema) => validate(schema, data, rootSchema).valid,
    validateFormData(data, schema, customValidate, transformErrors, uiSchema) {
      const result = validate(schema, data)
      const issues = result.issues.filter(issue => !['properties', 'items', '$ref', 'allOf'].includes(issue.keyword)
        || !result.issues.some(child => child !== issue && child.path.startsWith(issue.path) && child.keyword !== issue.keyword))
      let errors: RJSFValidationError[] = issues.map(issue => ({ name: issue.keyword, message: issue.message, params: { instancePath: issue.path },
        property: pathOf(issue.path).map(part => `[${JSON.stringify(part)}]`).join(''), schemaPath: issue.schemaPath, stack: `${issue.path} ${issue.message}` }))
      if (transformErrors) errors = transformErrors(errors, uiSchema)
      const builder = new ErrorSchemaBuilder()
      errors.forEach(error => builder.addErrors(error.message ?? error.stack, typeof error.params?.instancePath === 'string' ? pathOf(error.params.instancePath) : []))
      const validated = { errors, errorSchema: builder.ErrorSchema }
      return customValidate ? validationDataMerge(validated, unwrapErrorHandler(customValidate(data, createErrorHandler(data), uiSchema))) : validated
    },
  }
}
