import { PmIconButton, PmMenu, useMessages, useStore } from '@lincyaw/host'
import type { IRBlock, IRSection } from '@lincyaw/kernel'
import { reportPreview } from '@lincyaw/kernel'
import { BlockView } from '../block.ts'
import { SECTION_CONTEXT } from '../section-context.ts'
import { useViewer } from '../viewer-state.ts'
import { EDITOR_MESSAGES } from './messages.ts'

/** Generated content uses the same page/step selection as the sequence canvas. */
export function GeneratedPreview({ section, block }: { section: IRSection; block: IRBlock }) {
  const viewer = useViewer()
  const position = useStore(viewer.position)
  const t = useMessages(EDITOR_MESSAGES)
  const last = Math.min(section.steps, block.at + (block.span ?? 0))
  const step = position.section === section.id
    ? Math.max(block.at, Math.min(last, position.step))
    : block.at
  const animation = block.node.type === 'component' && block.node.name === 'PmScene'
  const navigate = (next: number) => viewer.show({ section: section.id, step: next })
  return (
    <div className="pm-generated-preview pm-ui" contentEditable={false}>
      <div className="pm-generated-preview__toolbar" data-preview-ui="">
        <span className="pm-generated-preview__label">{animation ? t.animation : t.contentPreview}</span>
        {last > block.at && <>
          <PmIconButton small icon="chevron-left" label={t.previousStep} hint={t.previousStep} disabled={step === block.at} onClick={() => navigate(step - 1)} />
          <PmMenu label={t.jumpStep} icon="steps" items={Array.from({ length: last - block.at + 1 }, (_, index) => {
            const value = block.at + index
            return { id: String(value), label: t.step(value + 1), icon: value === step ? 'check' as const : undefined }
          })} onSelect={id => navigate(Number(id))} />
          <span className="pm-generated-preview__position" aria-live="polite">{step + 1} / {section.steps + 1}</span>
          <PmIconButton small icon="chevron-right" label={t.nextStep} hint={t.nextStep} disabled={step === last} onClick={() => navigate(step + 1)} />
        </>}
        <PmIconButton small icon="edit-text" label={t.editNarration} hint={t.editNarration} onClick={() => reportPreview({ type: 'narrate', section: section.id, step })} />
      </div>
      <SECTION_CONTEXT.Provider value={{ section, step, view: 'document' }}>
        <BlockView block={block} section={section} step={step} />
      </SECTION_CONTEXT.Provider>
    </div>
  )
}
