import { defineScene, gsapScene } from '@lincyaw/addon-motion/scene'
import regression from '../../learn/scenes/regression.ts'
import { DATA, loss, predict, trajectory } from './model.ts'

type Shot = 'pain' | 'author' | 'arrange' | 'overshoot' | 'focus' | 'revisit' | 'outputs' | 'brand'
const urls = {
  high0: new URL('../assets/author-high0.png', import.meta.url),
  high1: new URL('../assets/author-high1.png', import.meta.url),
  high2: new URL('../assets/author-high2.png', import.meta.url),
  high3: new URL('../assets/author-high3.png', import.meta.url),
  low0: new URL('../assets/author-low0.png', import.meta.url),
  low1: new URL('../assets/author-low1.png', import.meta.url),
  low2: new URL('../assets/author-low2.png', import.meta.url),
  low4: new URL('../assets/author-low4.png', import.meta.url),
  low8: new URL('../assets/author-low8.png', import.meta.url),
  formula: new URL('../assets/author-formula-edit.png', import.meta.url),
  code: new URL('../assets/reading-code.png', import.meta.url),
  reading: new URL('../assets/reading-low8.png', import.meta.url),
  slides: new URL('../assets/presenting-low8.png', import.meta.url),
  video: new URL('../assets/teaching-video.jpg', import.meta.url),
}
type ImageKey = keyof typeof urls
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (x: number) => { const p = clamp(x); return p * p * (3 - 2 * p) }
const mix = (a: number, b: number, p: number) => a + (b - a) * p
const low = trajectory(.35, 8), high = trajectory(2.2, 3)

/** A product story made from observed application states, with no invented product controls. */
export default defineScene(async context => {
  const shot = context.parameters.shot as Shot
  const duration = context.total / 1000
  const images = {} as Record<ImageKey, HTMLImageElement>
  await Promise.all(Object.entries(urls).map(async ([key, url]) => {
    const img = new Image(); img.src = url.href; await img.decode(); images[key as ImageKey] = img
  }))
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  context.root.append(canvas)
  const paint = canvas.getContext('2d')!
  const paper = context.color('film-paper'), ink = context.color('film-ink'), accent = context.color('film-violet')
  const white = context.color('sheen'), line = context.color('film-silver')
  const fonts = getComputedStyle(context.root), sans = fonts.getPropertyValue('--pm-font-sans'), mono = fonts.getPropertyValue('--pm-font-mono')
  // Reuse the exact lesson SVG in its observed rectangle. Only its mathematical marks interpolate.
  // Application chrome, selected steps and every pictured control remain actual captured pixels.
  const chart = document.createElement('div')
  chart.style.cssText = 'position:absolute;left:0;top:0;width:703.984375px;height:312.8828125px;transform-origin:0 0;pointer-events:none;display:none'
  context.root.append(chart)
  const nativeChart = await regression.create({ ...context, root: chart, state: 'large-start' })
  const graphic = chart.querySelector('svg')!
  graphic.style.width = '100%'; graphic.style.height = '100%'
  const clipPrefix = `product-${crypto.randomUUID()}`
  for (const clip of graphic.querySelectorAll('clipPath[id]')) {
    const old = clip.id; clip.id = `${clipPrefix}-${old}`
    for (const node of graphic.querySelectorAll(`[clip-path="url(#${old})"]`)) node.setAttribute('clip-path', `url(#${clip.id})`)
  }
  const fit = chart.querySelector('[data-fit]')!, point = chart.querySelector('[data-loss]')!, values = chart.querySelector('[data-values]')!
  const stateLabel = chart.querySelectorAll('.lr-small')[0]!
  const rig = { zoom: 1, fx: 800, fy: 450 }
  const animation = await gsapScene(({ gsap }) => {
    const tl = gsap.timeline({ paused: true })
    if (shot === 'author') {
      tl.to(rig, { zoom: 1.13, fx: 880, fy: 420, duration: duration * .45, ease: 'power2.inOut' }, .6)
      tl.to(rig, { zoom: 1, fx: 800, fy: 450, duration: .65 }, duration - .8)
    }
    if (shot === 'overshoot' || shot === 'focus' || shot === 'revisit') {
      tl.to(rig, { zoom: 1.34, fx: 940, fy: 420, duration: .7, ease: 'power2.inOut' }, 0)
      tl.to(rig, { zoom: 1.28, fx: 940, fy: 420, duration: .7, ease: 'power2.inOut' }, duration - .8)
    }
    return tl
  }).create(context)
  const text = (words: string, x: number, y: number, size: number, color = ink, align: CanvasTextAlign = 'left', weight = 600) => {
    paint.fillStyle = color; paint.font = `${weight} ${size}px ${sans}`; paint.textAlign = align; paint.textBaseline = 'alphabetic'; paint.fillText(words, x, y)
  }
  const caption = (words: string) => {
    paint.fillStyle = paper; paint.fillRect(0, 648, 1280, 72)
    text(words, 640, 692, 30, ink, 'center')
  }
  const photo = (key: ImageKey, z = rig.zoom, fx = rig.fx, fy = rig.fy, alpha = 1) => {
    paint.save(); paint.globalAlpha = alpha
    paint.translate(640, 360); paint.scale(.8 * z, .8 * z); paint.translate(-fx, -fy)
    paint.drawImage(images[key], 0, 0, 1600, 900); paint.restore()
    // A fixed crop of the real app bar maintains identity during content close-ups.
    if (z > 1.02 && /^(high|low|formula)/.test(key)) paint.drawImage(images[key], 0, 0, 1600, 90, 0, 0, 1280, 72)
  }
  const formulaDetail = () => {
    photo('formula', 1.7, 920, 240)
    // Frame the actual editor below its real app bar, without duplicate zoomed chrome or reading notes.
    paint.fillStyle = paper; paint.fillRect(0, 72, 1280, 86); paint.fillRect(0, 478, 1280, 170)
  }
  const screen = (x: number, y: number) => [640 + (x - rig.fx) * .8 * rig.zoom, 360 + (y - rig.fy) * .8 * rig.zoom] as const
  const cursor = (x: number, y: number, press = 0) => {
    paint.save(); paint.translate(x, y)
    if (press > 0) { paint.globalAlpha = (1 - press) * .5; paint.strokeStyle = accent; paint.lineWidth = 2; paint.beginPath(); paint.arc(0, 0, 9 + press * 22, 0, Math.PI * 2); paint.stroke(); paint.globalAlpha = 1 }
    paint.fillStyle = ink; paint.strokeStyle = white; paint.lineWidth = 2; paint.lineJoin = 'round'
    paint.beginPath(); paint.moveTo(0, 0); paint.lineTo(0, 25); paint.lineTo(6, 19); paint.lineTo(12, 30); paint.lineTo(17, 27); paint.lineTo(11, 16); paint.lineTo(21, 16); paint.closePath(); paint.fill(); paint.stroke(); paint.restore()
  }
  const updateChart = (w: number, alpha: number, iteration: number) => {
    const unit = context.root.clientWidth / 1600
    const [x, y] = screen(566, 250.53125)
    chart.style.display = 'block'
    chart.style.transform = `translate(${x * context.root.clientWidth / 1280}px,${y * context.root.clientWidth / 1280}px) scale(${unit * rig.zoom})`
    fit.setAttribute('d', `M${235 - 1.7 * 105} ${190 - predict(-1.7, w) * 26}L${235 + 1.7 * 105} ${190 - predict(1.7, w) * 26}`)
    point.setAttribute('cx', String(536 + (w + 4) * 18)); point.setAttribute('cy', String(310 - loss(w) * 7))
    values.textContent = `w = ${w.toFixed(3)}   L = ${loss(w).toFixed(4)}`
    stateLabel.textContent = `α = ${alpha}   iteration = ${iteration}`
  }
  const teach = (seconds: number, alpha: number, iterations: readonly number[], keys: readonly ImageKey[], starts: readonly number[]) => {
    let index = 0
    for (let i = 1; i < starts.length; i++) if (seconds >= starts[i]!) index = i
    const elapsed = index ? seconds - starts[index]! : 1
    photo(keys[index && elapsed < .2 ? index - 1 : index]!)
    const current = trajectory(alpha, iterations[index]!).at(-1)!
    const previous = trajectory(alpha, iterations[Math.max(0, index - 1)]!).at(-1)!
    const progress = index ? smooth((seconds - starts[index]! - .2) / .75) : 1
    updateChart(mix(previous.w, current.w, progress), alpha, iterations[elapsed < .2 ? Math.max(0,index - 1) : index]!)
    if (index && progress > 0 && progress < 1) stateLabel.textContent = `α = ${alpha}`
    if (index) {
      const selected = alpha > 1 ? iterations[index]! : ({0:4,1:5,2:6,4:7,8:8} as Record<number,number>)[iterations[index]!]!
      const previousSelected = alpha > 1 ? iterations[index-1]! : ({0:4,1:5,2:6,4:7,8:8} as Record<number,number>)[iterations[index-1]!]!
      const [cx, cy] = screen(581 + mix(previousSelected,selected,smooth(elapsed / .18)) * 34, 665.5)
      cursor(cx, cy, elapsed < .6 ? clamp(elapsed / .6) : 0)
    }
  }
  const smallGraph = (x: number, y: number, w: number) => {
    paint.save(); paint.translate(x, y); paint.strokeStyle = line; paint.lineWidth = 1
    paint.beginPath(); paint.moveTo(-110, 0); paint.lineTo(110, 0); paint.moveTo(0, -85); paint.lineTo(0, 85); paint.stroke()
    paint.strokeStyle = accent; paint.lineWidth = 3
    paint.beginPath(); paint.moveTo(-105, -predict(-1.5, w) * 16); paint.lineTo(105, -predict(1.5, w) * 16); paint.stroke()
    DATA.forEach(p => { paint.beginPath(); paint.arc(p.x * 70, -p.y * 16, 4, 0, Math.PI * 2); paint.fillStyle = ink; paint.fill() }); paint.restore()
  }
  const pain = (t: number) => {
    text('Presmium', 48, 48, 25)
    text('明天，讲学习率。', 640, 128, 42, ink, 'center')
    const tabs = [{x:90,y:230,w:340,h:250,title:'讲义'}, {x:470,y:190,w:340,h:250,title:'训练代码'}, {x:850,y:260,w:340,h:250,title:'预测结果'}]
    tabs.forEach((b, i) => {
      const active = Math.floor(t / .85) % 3 === i
      paint.fillStyle = white; paint.strokeStyle = active ? accent : line; paint.lineWidth = active ? 2 : 1
      paint.beginPath(); paint.roundRect(b.x, b.y, b.w, b.h, 12); paint.fill(); paint.stroke()
      text(b.title, b.x + 20, b.y + 34, 20)
      paint.strokeStyle = line; paint.lineWidth = 1; paint.beginPath(); paint.moveTo(b.x, b.y + 52); paint.lineTo(b.x + b.w, b.y + 52); paint.stroke()
    })
    text('w ← w − α ∇L(w)', 120, 360, 26, ink)
    paint.font = `22px ${mono}`; paint.fillStyle = ink; paint.textAlign = 'left'
    paint.fillText('alpha = 2.2', 490, 300); paint.fillText('grad = gradient(w)', 490, 345); paint.fillText('w -= alpha * grad', 490, 390)
    paint.save(); paint.beginPath(); paint.rect(870, 322, 300, 170); paint.clip()
    smallGraph(1020, 412, t > 1.5 ? high[1]!.w : high[0]!.w); paint.restore()
    const p = smooth((t - 1.8) / .45); cursor(mix(700, 1050, p), mix(390, 480, p))
    caption('代码跑完了。这一步，学生跟上了吗？')
    // The actual product replaces the scattered materials early, rather than remaining a metaphor.
    if (t > 3.6) photo('high0', 1, 800, 450, smooth((t - 3.6) / .6))
  }
  return {
    seek(ms) {
      animation.seek(ms)
      const box = context.root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(box.width * dpr)), height = Math.max(1, Math.round(box.height * dpr))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      paint.setTransform(width / 1280, 0, 0, height / 720, 0, 0); paint.fillStyle = paper; paint.fillRect(0, 0, 1280, 720)
      chart.style.display = 'none'
      const t = ms / 1000
      if (shot === 'pain') pain(t)
      if (shot === 'author') {
        if (t < duration * .48) photo('high0'); else formulaDetail()
        caption('把过程，组织成一堂讲解。')
      }
      if (shot === 'arrange') {
        if (t < duration * .3) { formulaDetail(); caption('公式，也能直接编辑。') }
        else if (t < duration * .68) {
          paint.drawImage(images.code, 0, 0, 1585, 56, 0, 0, 1280, 45)
          text('一次更新，落在这一行。', 640, 174, 38, ink, 'center')
          paint.drawImage(images.code, 246, 332, 1078, 225, 96, 250, 1088, 227)
          paint.save(); paint.globalAlpha = .12; paint.fillStyle = accent; paint.fillRect(108, 374, 680, 27); paint.restore()
        }
        else { photo('high0', 1.15, 920, 420); caption('再看预测线，会怎样改变。') }
      }
      if (shot === 'overshoot') { teach(t, 2.2, [0,1,2,3], ['high0','high1','high2','high3'], [0,1.1,3.2,5.3]); if(t>7)caption('步子太大，损失反而上升。') }
      if (shot === 'focus') { teach(t, .35, [0,1,2,4,8], ['low0','low1','low2','low4','low8'], [0,.8,2.0,3.4,5.3]); if(t>6.8)caption('从同一起点，看见稳定收敛。') }
      if (shot === 'revisit') {
        teach(t, .35, [8,2,8], ['low8','low2','low8'], [0,.8,3.4])
        caption('刚才那一步，随时回看。')
      }
      if (shot === 'outputs') {
        const i = Math.min(2, Math.floor(t / (duration / 3))), local = t - i * duration / 3
        const key = (['reading','slides','video'] as const)[i]!
        photo(key, 1 + .015 * smooth(local / 1.5), 800, 450)
        const labels = ['阅读','放映','视频']
        paint.fillStyle = paper; paint.fillRect(0, 648, 1280, 72); text(labels[i]!, 48, 694, 25); text('讲过，也能继续探索。', 1232, 694, 28, ink, 'right')
      }
      if (shot === 'brand') {
        const p = smooth(t / .65)
        photo('video', 1.015, 800, 450, 1 - p); paint.globalAlpha = p
        paint.fillStyle = paper; paint.fillRect(0, 0, 1280, 720)
        text('Presmium', 640, 300, 88, ink, 'center'); text('让每一步，都讲得明白。', 640, 400, 46, ink, 'center'); text('开始创作', 640, 523, 27, accent, 'center')
        paint.globalAlpha = 1
      }
    },
    dispose() { animation.dispose?.(); nativeChart.dispose?.(); chart.remove(); canvas.remove() },
  }
})
