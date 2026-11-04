import { figureTour } from './lib/tour.ts'
import type { Shot } from './lib/tour.ts'
import type { FigureMap } from './lib/figure.ts'
import demoImage from './figures/demo.png'
import demoMap from './figures/demo.json'

// Figure tour: a paper's own figure, cropped from its PDF, explained one region at a time. One state per shot; every
// beat is a fraction of its state, so retiming the states to a voiceover moves the beats with their sentences. In
// each, 0.04 of the state the camera moves to the shot's region, for 0.36 of the state and at most 1 s (a zoom about
// the point that stays still, at most 2× so the crop stays sharp, never past the figure's edge where the figure fills
// the window); 0.05 the keyword beside the window fades and the next rises in 0.22 s later; 0.38 a ring appears round
// the named words (or moves there from the last ring, or fades at 0.02 when the shot has none); 0.4 a point pops in
// at its data coordinates, 0.45 dotted guides run from it down and left to the plot's axes, 0.6 its label appears;
// 0.35 a dashed line sweeps in from the left over 0.4 of the state, ending where it leaves the plot. Marks stay to
// the end and keep their size on screen as the figure zooms. The first state brings the window in (0–0.3) and the
// source line (0.3). The window (66 × 37 cqw) and the keyword column sit side by side. Parameters: `image` (a full
// URL of the crop) and `map` (its word map, the JSON `../tools/figure.py` writes beside it), both defaulting to a
// synthetic demo figure; `axes` (two tick labels per axis and the plot's range); `shots`; `source`; `ink` (the token
// colour of the marks, `accent` unless the figure is close to it). Words are named by their text, or `text#n` for the
// n-th (0-based) of several. A document's own crop is imported in its own scene file through `figureTour`
// (`lib/tour.ts`): a relative path in a parameter resolves against the page, which differs between the reading page
// and the slides. The installed skill carries text files only: where `figures/demo.png` is missing, make it again
// with the commands in `figures/demo-figure.py`.

const PANEL_A = ['(a)', 'Validation', '1e22', '(FLOPs)']
const shots: Shot[] = [
  { frame: 'whole', keyword: '两个分图' },
  { frame: PANEL_A, ring: ['frontier'], keyword: '计算最优前沿' },
  { frame: { data: [[1e19, 1.88], [2.8e21, 2.92]] }, point: [1e21, 2.329], guides: true, label: '2.33', keyword: '10²¹ FLOPs：损失 2.33' },
  { frame: PANEL_A, line: [[1e19, 2.986], [1e22, 1.828]], keyword: '直线外推：偏低' },
]

export default figureTour({
  image: demoImage as string,
  map: demoMap as FigureMap,
  axes: { x: { ticks: [['1e19', 1e19], ['1e21', 1e21]], log: true, range: [1e18, 1e22] }, y: { ticks: [['2.5', 2.5], ['3.5', 3.5]], range: [2, 4] } },
  shots,
  source: '示意图 · 合成数据',
  // The demo figure is drawn in blues, close to the accent of some themes.
  ink: 'category-6',
})
