import { currentLocale } from '@lincyaw/host'
import { VIEWER_MESSAGES } from '../domain/index.ts'
import type { Messages } from '../domain/index.ts'

export function viewerMessages(): Messages {
  return VIEWER_MESSAGES[currentLocale()]
}
