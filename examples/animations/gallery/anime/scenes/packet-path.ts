import { animeScene } from '@lincyaw/addon-motion/scene'

// svg.createMotionPath: a request travels from the client through two routers to the server, and the reply comes back.
// The packet is drawn around (0, 0) and placed only by the motion path's translateX/translateY (CSS transform in the SVG's user units);
// the reply uses its own reversed path, since one path has one direction. Only the first tween of a property states a
// from-value: a later [from, to] is not restored when seeking back past its start (Anime.js 4.5), a bare `to` is.
const ROUTE = 'M 110 300 C 200 300, 200 140, 300 140 L 500 140 C 600 140, 600 300, 690 300'
const BACK = 'M 690 300 C 600 300, 600 140, 500 140 L 300 140 C 200 140, 200 300, 110 300'
const HOSTS: Array<[string, number, number]> = [['客户端', 110, 300], ['路由器', 300, 140], ['路由器', 500, 140], ['服务器', 690, 300]]

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const ok = color('ok')
  const surface = color('surface')
  const line = color('line-strong')
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      <path id="route" d="${ROUTE}" stroke="${line}" stroke-width="3" stroke-dasharray="8 8" fill="none" />
      <path id="back" d="${BACK}" fill="none" stroke="none" />
      ${HOSTS.map(([name, x, y]) => `
        <rect x="${x - 55}" y="${y - 26}" width="110" height="52" rx="10" fill="${surface}" stroke="${ink}" stroke-width="2" />
        <text x="${x}" y="${y + 7}" text-anchor="middle" font-size="19" fill="${ink}">${name}</text>`).join('')}
      <g id="req" opacity="0"><rect x="-26" y="-14" width="52" height="28" rx="6" fill="${accent}" /><text y="6" text-anchor="middle" font-size="14" fill="${color('on-accent')}">GET</text></g>
      <g id="res" opacity="0"><rect x="-26" y="-14" width="52" height="28" rx="6" fill="${ok}" /><text y="6" text-anchor="middle" font-size="14" fill="${color('on-accent')}">200</text></g>
    </svg>`
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the route between the hosts.
  tl.add('#route', { opacity: [0, 1], duration: 500 }, at(0))
  // Step 1: the request rides the route; `rotate` from the path tilts it along the curves.
  tl.add('#req', { ...anime.svg.createMotionPath('#route'), duration: 1600, ease: 'inOutSine' }, at(1))
  tl.add('#req', { opacity: [0, 1], duration: 150 }, at(1))
  tl.add('#req', { opacity: 0, duration: 150 }, at(1) + 1600)
  // Step 2: the reply comes back on the reversed path.
  // Only its position is taken: the path runs right to left, so its `rotate` would turn the label upside down.
  const { translateX, translateY } = anime.svg.createMotionPath('#back')
  tl.add('#res', { translateX, translateY, duration: 1600, ease: 'inOutSine' }, at(2))
  tl.add('#res', { opacity: [0, 1], duration: 150 }, at(2))
  return tl
})
