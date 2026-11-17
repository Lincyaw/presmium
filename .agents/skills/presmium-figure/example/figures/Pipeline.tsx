import { useStepScope } from '@lincyaw/host'
import './figure.css'

// The figure's pictures, in the order its steps build them; each step names one in `state`.
const ORDER = ['input', 'model', 'output', 'focus'] as const
type State = typeof ORDER[number]

const BOXES = [
  { id: 'input', x: 20, label: 'Tokens' },
  { id: 'model', x: 220, label: 'Transformer' },
  { id: 'output', x: 420, label: 'Logits' },
] as const

/** A three-stage pipeline drawn as SVG: one stage more at each step, then the middle stage highlighted. */
export default function Pipeline({ title = 'Pipeline' }: { title?: string }) {
  const scope = useStepScope()
  const state = (scope.state ?? 'focus') as State
  const shown = ORDER.indexOf(state)
  return (
    <svg data-figure="pipeline" className="figure" viewBox="0 0 600 160" role="img" aria-label={title}>
      <defs>
        <marker id="pipeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="figure__arrowhead" />
        </marker>
      </defs>
      {BOXES.map((box, i) => i <= shown && (
        <g key={box.id} className={state === 'focus' && box.id === 'model' ? 'figure__box figure__box--focus' : 'figure__box'}>
          <rect x={box.x} y="50" width="160" height="60" rx="10" />
          <text x={box.x + 80} y="85">{box.label}</text>
        </g>
      ))}
      {BOXES.slice(1).map((box, i) => i + 1 <= shown && (
        <line key={box.id} className="figure__arrow" x1={BOXES[i]!.x + 160} y1="80" x2={box.x - 4} y2="80" markerEnd="url(#pipeline-arrow)" />
      ))}
    </svg>
  )
}
