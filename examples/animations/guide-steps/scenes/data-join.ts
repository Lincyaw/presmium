import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, phase, stage } from './kit/stage.ts'

// The data join (enter, update, exit) with a key function, as in the "general update pattern": letters that stay
// slide to their new place, new ones drop in, removed ones fall out. Seek-safe: the join is made once over the union
// of all states; each frame places every letter from the two states around `ms`, instead of joining at the time.
const STATES = ['dataviz', 'datajoin', 'enter', 'exit']

export default d3Scene(({ root, d3, at, color }) => {
  const keyed = STATES.map(word => {
    const seen = new Map<string, number>()
    // "a" twice is two letters: a key per occurrence.
    return [...word].map((ch, i) => {
      const n = (seen.get(ch) ?? 0) + 1
      seen.set(ch, n)
      return { key: `${ch}${n}`, ch, i }
    })
  })
  const all = [...new Map(keyed.flat().map(d => [d.key, d.ch])).entries()].map(([key, ch]) => ({ key, ch }))
  const svg = stage(d3, root)
  const step = 62
  const x0 = (len: number) => W / 2 - (len - 1) * step / 2
  const caption = svg.append('text').attr('x', W / 2).attr('y', 54).attr('text-anchor', 'middle')
    .attr('font-family', 'var(--pm-font-mono)').attr('font-size', 18).attr('fill', color('muted'))
  const legend = svg.append('g').attr('font-size', 15).attr('transform', `translate(${W / 2 - 150},${H - 40})`)
  const LEGEND = [['update', color('ink')], ['enter', color('ok')], ['exit', color('danger')]] as const
  legend.selectAll('g').data(LEGEND).join('g').attr('transform', (_, i) => `translate(${i * 110},0)`)
    .call(g => g.append('circle').attr('r', 6).attr('fill', d => d[1]))
    .call(g => g.append('text').attr('x', 12).attr('dy', '0.35em').attr('fill', color('muted')).text(d => d[0]))
  const letters = svg.append('g').attr('font-family', 'var(--pm-font-mono)').attr('font-size', 64).attr('text-anchor', 'middle')
    .selectAll('text').data(all, d => (d as { key: string }).key).join('text').text(d => d.ch)
  const where = keyed.map(state => new Map(state.map(d => [d.key, d.i])))
  const xs = (k: number, key: string) => x0(STATES[k]!.length) + where[k]!.get(key)! * step
  const ink = color('ink'), ok = color('ok'), danger = color('danger')
  const yMid = H / 2 + 20
  return (ms: number) => {
    const p = phase(at, ms)
    // Step 0 brings in the first word; step k (k ≥ 1) goes from state k-1 to state k.
    let k = 0
    while (k + 1 < STATES.length && ms >= at(k + 1)) k++
    const t = k === 0 ? p(0) : p(k)
    const from = k === 0 ? undefined : where[k - 1]!
    const to = where[k]!
    caption.text(k === 0 ? `data(["${STATES[0]}"])` : `"${STATES[k - 1]}" → "${STATES[k]}"`)
    const e = d3.easeCubicInOut(t)
    letters.each(function (d) {
      const el = d3.select(this)
      const was = k === 0 ? false : from!.has(d.key)
      const is = to.has(d.key)
      if (was && is) { // update
        el.attr('x', d3.interpolateNumber(xs(k - 1, d.key), xs(k, d.key))(e)).attr('y', yMid).attr('opacity', 1).attr('fill', ink)
      } else if (is) { // enter
        el.attr('x', xs(k, d.key)).attr('y', yMid - 90 * (1 - d3.easeBounceOut(t))).attr('opacity', Math.min(1, t * 3))
          .attr('fill', d3.interpolateLab(ok, ink)(d3.easeCubicIn(Math.max(0, t * 2 - 1))))
      } else if (was) { // exit
        el.attr('x', xs(k - 1, d.key)).attr('y', yMid + 110 * d3.easeCubicIn(t)).attr('opacity', 1 - t).attr('fill', danger)
      } else el.attr('opacity', 0)
    })
  }
})
