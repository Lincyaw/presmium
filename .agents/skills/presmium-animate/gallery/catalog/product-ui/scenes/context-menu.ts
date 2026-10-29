import { gsapScene } from '@lincyaw/addon-motion/scene'
import { invertEase } from '../../../lengths/scenes/kit/fx/time.ts'
import { atoms, device, DEVICE_CSS, DUR, esc, frame, list, num, pick, POINTER, POINTER_CSS, shadow, str } from './lib/ui.ts'

// Context menu: in a file window the pointer right-clicks a file, a menu blooms from the tip, the highlight follows
// the item under the pointer, and the chosen action happens. States `files`, `menu`, `choose`, `done`. `files`
// (1 s): the window rises, the pointer arrives on the file. `menu` (1.2 s): 0–0.12 s the press, the row is
// selected; 0.1–0.4 s the menu grows from the pointer's tip (scale 0.92 to 1 with its origin at the tip,
// opacity first, a 2% overshoot); 0.45–1.05 s the pointer moves down the menu and the highlight jumps to each
// item at the moment the pointer enters it (computed from the ease of the move, so it is exact at any seek).
// `choose` (0.7 s): the press on the item, then the menu leaves faster than it came. `done` (1.8 s): the effect,
// the row takes a status chip and a short confirmation rises under the window; the pointer steps aside; hold.
// Adapted from HyperFrames cursor-context-menu.
interface File { name: string, meta?: string }
const ROW_TOP = 22, ROW_H = 9.4, ITEM_H = 6.6, MENU_W = 21   // % of the frame

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const files = list<File>(parameters, 'files', [
    { name: '第 1 讲 · 线性回归', meta: '讲义 · 昨天' },
    { name: '第 2 讲 · 梯度下降', meta: '讲义 · 周一' },
    { name: '第 3 讲 · 过拟合', meta: '讲义 · 刚刚' },
    { name: '习题 3', meta: 'PDF · 上周' },
    { name: '封面图', meta: '图片 · 上周' },
  ]).slice(0, 6)
  const row = Math.min(files.length - 1, num(parameters, 'file', 2))
  const items = list<string>(parameters, 'items', ['打开', '重命名', '复制链接', '导出为视频', '删除'])
  const pick$ = Math.min(items.length - 1, num(parameters, 'choose', 3))
  const status = str(parameters, 'status', '导出中')
  const result = str(parameters, 'result', '✓ 已加入导出队列')
  const px = 40, py = ROW_TOP + row * ROW_H + ROW_H / 2   // the right-click point
  const mx = px + 0.4, my = py + 0.8                      // the menu's corner, at the tip
  const f = frame(root, `
    ${DEVICE_CSS}
    ${POINTER_CSS}
    .cm__win { position: absolute; left: 13cqw; top: 6cqh; width: 74cqw; height: ${ROW_TOP + files.length * ROW_H + 3 - 6}cqh; border-radius: 1.2cqw; box-shadow: ${shadow(1.6)}; }
    .cm__row { position: absolute; left: 15cqw; width: 70cqw; height: ${ROW_H}cqh; display: flex; align-items: center; gap: 1.4cqw; padding: 0 1.4cqw; border-radius: 0.8cqw; font-size: 1.8cqw; }
    .cm__icon { width: 2.4cqw; height: 3cqw; flex: none; border-radius: 0.3cqw; border: 0.2cqw solid var(--pm-color-line-strong); background: var(--pm-color-surface); }
    .cm__name { flex: 1; white-space: nowrap; }
    .cm__meta { font-size: 1.45cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .cm__chip { font-size: 1.4cqw; padding: 0.3cqw 1cqw; }
    .cm__sel { position: absolute; left: 15cqw; width: 70cqw; top: ${ROW_TOP + row * ROW_H}cqh; height: ${ROW_H}cqh; border-radius: 0.8cqw; background: var(--pm-color-accent-soft); opacity: 0; }
    .cm__menu { position: absolute; left: ${mx}cqw; top: ${my}cqh; width: ${MENU_W}cqw; padding: 0.8cqh 0.5cqw; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong); box-shadow: ${shadow(2.4)}; transform-origin: 0 0; }
    .cm__item { position: relative; height: ${ITEM_H}cqh; display: flex; align-items: center; padding: 0 1.2cqw; font-size: 1.7cqw; }
    .cm__hl { position: absolute; left: 0.5cqw; right: 0.5cqw; top: 0.8cqh; height: ${ITEM_H}cqh; border-radius: 0.6cqw; background: var(--pm-color-accent); opacity: 0; }
    .cm__toast { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; top: 90cqh; }
  `, `
    <div class="cm__win">${device('window', '', str(parameters, 'title', '课程文件'))}</div>
    <i class="cm__sel"></i>
    ${files.map((fl, i) => `<div class="cm__row" style="top:${ROW_TOP + i * ROW_H}cqh"><i class="cm__icon"></i><span class="cm__name">${esc(fl.name)}</span>${i === row ? `<span class="lf-chip cm__chip">${esc(status)}</span>` : ''}<span class="cm__meta">${esc(fl.meta ?? '')}</span></div>`).join('')}
    <div class="cm__menu"><i class="cm__hl"></i>${items.map((it, i) => `<div class="cm__item" data-i="${i}">${esc(it)}</div>`).join('')}</div>
    <div class="lf-chip cm__toast">${esc(result)}</div>
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const layer = pick(f, '.lf-pointer-layer'), menu = pick(f, '.cm__menu'), hl = pick(f, '.cm__hl')
  const rows = [...f.querySelectorAll<HTMLElement>('.cm__item')]
  // files
  a.enter('.cm__win', 0, { from: 'fade', duration: 0.35 })
  a.enter('.cm__row', 0.1, { stagger: 0.03, from: 'fade', duration: 0.3 })
  gsap.set(layer, { xPercent: 90, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.3)
  a.point(layer, Math.max(0.35, s(1) - 0.65), px, py)
  // menu: right-click, the row is selected, the menu blooms from the tip
  const m = s(1)
  a.click('.lf-pointer', '.lf-pointer__ring', undefined, m)
  tl.to('.cm__sel', { opacity: 1, duration: 0.12 }, m + 0.05)
  gsap.set(menu, { autoAlpha: 0, scale: 0.92 })
  tl.to(menu, { autoAlpha: 1, duration: 0.12, ease: 'power1.out' }, m + 0.1)
  tl.to(menu, { scale: 1, duration: 0.3, ease: 'back.out(1.6)' }, m + 0.1)
  // the pointer runs down the menu; the highlight jumps to each item as the pointer enters it
  const y0 = my + 0.8 + ITEM_H * 0.5, y1 = my + 0.8 + ITEM_H * (pick$ + 0.5)
  const run = 0.6, t0 = m + 0.45, ease = gsap.parseEase('power3.inOut')
  a.point(layer, t0, mx + 5, y0, { duration: 0.25 })
  a.point(layer, t0 + 0.25, mx + 6, y1, { duration: run })
  for (let i = 0; i <= pick$; i++) {
    const enter = my + 0.8 + ITEM_H * i              // the item's top edge
    const p = i === 0 ? 0 : invertEase(ease, (enter - y0) / Math.max(0.01, y1 - y0))
    const t = i === 0 ? t0 + 0.15 : t0 + 0.25 + p * run
    tl.set(hl, { opacity: 1, y: (i * ITEM_H * (f.clientHeight || 360)) / 100 }, t)
    if (i > 0) tl.set(rows[i - 1]!, { color: color('ink') }, t)
    tl.set(rows[i]!, { color: color('on-accent') }, t)
  }
  // choose: the press, the menu leaves
  const c = s(2)
  a.click('.lf-pointer', '.lf-pointer__ring', rows[pick$], c)
  tl.to(menu, { autoAlpha: 0, scale: 0.96, duration: DUR.exit, ease: 'power2.in' }, c + 0.25)
  // done: the row's status, the confirmation
  const d = s(3)
  gsap.set('.cm__chip', { autoAlpha: 0, scale: 0.6 })
  tl.to('.cm__chip', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, d)
  tl.to('.cm__sel', { backgroundColor: color('accent-soft'), duration: 0.2 }, d)
  a.enter('.cm__toast', d + 0.3)
  a.point(layer, d + 0.1, 82, 80)
  return tl
})
