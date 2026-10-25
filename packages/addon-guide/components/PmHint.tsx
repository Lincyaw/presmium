import CueNote from '../src/client/CueNote.tsx'
import { requestHint, useCue } from '../src/client/index.ts'
import type { CueProps } from '../src/client/cue.ts'
import './PmHint.css'
export default function PmHint(props: CueProps) {
  const { anchor, look, note } = useCue(props, 'data-pm-hint', requestHint)
  return (
    <>
      <CueNote title={props.title} text={props.text} state={note} />
      <span
        ref={anchor}
        className="pm-hint"
        hidden
        data-target={props.target}
        data-look={look ?? 'off'}
      />
    </>
  )
}
