import { currentLocale } from '@lincyaw/host'
import { MESSAGES } from '../domain/index.ts'
import type { StageMessages } from '../domain/index.ts'

export function messages(): StageMessages {
  return MESSAGES[currentLocale()]
}
