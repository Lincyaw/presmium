import { gsapScene } from '@lincyaw/addon-motion/scene'

// Physics2D: three projectiles with the same speed at 30°, 45° and 60°; each tween lasts exactly its time of
// flight, so it ends on the ground. Physics2D is a closed form of time (with friction it recomputes from the
// start when going back), so it seeks exactly. Speeds are in px/s from the scene's width at build time.
const ANGLES = [45, 30, 60]

export default gsapScene(({ root, gsap, at, width, height }) => {
  const range = width * 0.75 // the 45° shot lands here
  const g = height * 1.6 // px/s²
  const v = Math.sqrt(range * g)
  const flight = (deg: number) => 2 * v * Math.sin(deg * Math.PI / 180) / g
  const reach = (deg: number) => v * v * Math.sin(2 * deg * Math.PI / 180) / g
  root.innerHTML = `
    <style>
      .ph__ground { position: absolute; left: 6%; right: 4%; bottom: 10%; border-top: 2px solid var(--pm-color-line-strong); }
      .ph__ball { position: absolute; left: 8%; bottom: 10%; width: 1.1rem; height: 1.1rem; margin: 0 0 -0.55rem -0.55rem; border-radius: 50%; }
      .ph__mark { position: absolute; bottom: 4%; transform: translateX(-50%); font: 600 0.95rem var(--pm-font-mono); opacity: 0; }
    </style>
    <div class="ph__ground"></div>
    ${ANGLES.map((a, i) => `
      <div class="ph__ball" data-i="${i}" style="background:var(--pm-color-${['accent', 'warn', 'danger'][i]})"></div>
      <div class="ph__mark" data-i="${i}" style="left:calc(8% + ${reach(a)}px);bottom:${i === 2 ? 14 : 4}%;color:var(--pm-color-${['accent', 'warn', 'danger'][i]})">${a}°</div>`).join('')}`
  const s = (k: number) => at(k) / 1000
  const ball = (i: number) => root.querySelector(`.ph__ball[data-i="${i}"]`)
  const mark = (i: number) => root.querySelector(`.ph__mark[data-i="${i}"]`)
  const shoot = (i: number, t: number) => {
    const a = ANGLES[i]
    tl.to(ball(i), { physics2D: { velocity: v, angle: -a, gravity: g }, duration: flight(a) }, t)
    tl.to(mark(i), { opacity: 1, duration: 0.2 }, t + flight(a))
  }
  const tl = gsap.timeline()
  // Step 0: the 45° shot, the farthest one.
  shoot(0, s(0))
  // Step 1: 30° and 60° land at the same place, short of 45°.
  shoot(1, s(1))
  shoot(2, s(1))
  return tl
})
