import CueNote from '../src/client/CueNote.tsx'
import { requestSpotlight, useCue } from '../src/client/index.ts'
import type { CueProps } from '../src/client/cue.ts'
import './PmSpotlight.css'
export default function PmSpotlight(props: CueProps) {
  const { anchor, look, note } = useCue(
    props,
    'data-pm-spotlight',
    requestSpotlight,
  )
  return (
    <>
      <CueNote title={props.title} text={props.text} state={note} />
      <span
        ref={anchor}
        className="pm-spotlight"
        hidden
        data-target={props.target}
        data-look={look ?? 'off'}
      />
    </>
  )
}
