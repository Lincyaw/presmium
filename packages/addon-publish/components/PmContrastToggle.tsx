import { PmIcon, useMessages } from '@lincyaw/host'
import { useHighContrast } from '../src/client/contrast.ts'
import { MESSAGES } from '../src/domain/index.ts'
import './PmContrastToggle.css'
export default function PmContrastToggle({ compact }: { compact?: boolean }) {
  const { enabled, toggle } = useHighContrast(),
    t = useMessages(MESSAGES)
  return (
    <button
      type="button"
      role="switch"
      className={`pm-contrast-toggle pm-ui-button pm-ui-button--small${compact ? ' pm-contrast-toggle--compact pm-ui-button--ghost' : ''}`}
      aria-checked={enabled}
      aria-label={t.highContrast}
      title={t.highContrast}
      onClick={toggle}
    >
      <PmIcon className="pm-contrast-toggle__icon" name="contrast" />
      {!compact && <span>{t.highContrastState(enabled)}</span>}
    </button>
  )
}
