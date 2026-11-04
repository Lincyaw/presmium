// Scaffold a new paper film: `papers/<slug>/` with a lecture.json in the series' standard order, the opening page
// with its fixed line, a placeholder scene for every other page, a storyboard to fill in and a data module stub.
//
//   node tools/new-paper.mjs <slug> --title <文稿标题> --institution <单位> --paper <English title> \
//     --paper-zh <中文名> --arxiv <id> --authors <作者 等> [--year 2026]
//   node tools/new-paper.mjs hinted-scaling-laws --title '带提示的缩放定律：小模型零分时怎样预测大模型' \
//     --institution 斯坦福大学 --paper 'Hinted Scaling Laws' --paper-zh 带提示的缩放定律 --arxiv 2611.02270 \
//     --authors 'Suze van Adrichem, Luke Bailey, Rohith Kuditipudi 等'
//
// The pages, in the order every film follows (CLAUDE.md, 标准): opening; problem (问题, 为什么重要, 论文要解决什么);
// method; evidence; close (条件, 结论); then the reading-only sources page, which the video skips. Each step has a TODO narration and its
// scene a placeholder that shows the page and the step, so the document compiles and can be previewed at once.
// Narration, steps and scenes are then written in lecture.json and scenes/; the skeleton is never generated again.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { WORKSPACE } from './mcp.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' }, institution: { type: 'string' }, paper: { type: 'string' }, 'paper-zh': { type: 'string' },
    arxiv: { type: 'string' }, authors: { type: 'string' }, year: { type: 'string', default: String(new Date().getFullYear()) },
  },
})
const [slug] = positionals
const missing = ['title', 'institution', 'paper', 'paper-zh', 'arxiv', 'authors'].filter(k => !values[k])
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || missing.length) {
  console.error(`usage: node tools/new-paper.mjs <slug, lowercase-with-dashes> --title … --institution … --paper … --paper-zh … --arxiv … --authors …${missing.length ? `\nmissing: ${missing.map(k => `--${k}`).join(', ')}` : ''}`)
  process.exit(2)
}
const dir = join(WORKSPACE, slug)
if (existsSync(dir)) { console.error(`${dir} exists already`); process.exit(1) }

const v = values
const OPENING = `三分钟读完一篇论文。大家好，这里是翰林院传达室，今天给大家带来${v.institution}的《${v['paper-zh']}》。`
/** key, page title, the title of each step (its TODO says what the step must carry). */
const PAGES = [
  ['problem', 'TODO 问题（标题写成一句论断）', ['问题', '为什么重要', '论文要解决什么']],
  ['method', 'TODO 方法', ['方法的组成', '方法怎样做']],
  ['evidence', 'TODO 主要证据', ['主要结果', '与基线对照']],
  ['close', 'TODO 条件与结论', ['条件与局限', '一句结论']],
]

const text = t => ({ type: 'text', text: t })
const fallback = t => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: t }]}] })
const sections = {}, blocks = {}, steps = {}, definitions = {}, narrations = {}, order = []
function page(key, title, stepTitles, scene, params, texts, alt) {
  const sid = `p-${key}`, did = `${key}--scene--definition`, bid = `${key}--scene`
  order.push(sid)
  definitions[did] = {
    id: did, kind: 'scene', schemaVersion: 1, implementation: { type: 'file', path: `scenes/${scene}.ts` }, parameterSchema: { type: 'object' },
    states: stepTitles.map((_, i) => ({ id: `s${i}` })),
    data: { plugin: 'presmium.motion', name: 'PmScene', durations: stepTitles.map(() => 10000), fallback: fallback(alt), language: 'typescript' },
  }
  blocks[bid] = { id: bid, type: 'component', definitionId: did, parameters: { scene, alt, ...params } }
  const ids = stepTitles.map((stepTitle, i) => {
    const st = `${key}--step-${i}`, nid = `${st}--n0`
    narrations[nid] = { id: nid, content: [text(texts[i])] }
    steps[st] = { id: st, sectionId: sid, title: stepTitle, visuals: [{ blockId: bid, visible: true, state: `s${i}` }], narrationIds: [nid] }
    return st
  })
  sections[sid] = { id: sid, title, level: 2, children: [bid], stepOrder: ids, layout: { type: 'scrolly', renderers: { web: { layout: 'scrolly' }, slides: { layout: 'full' } } } }
}

page('opening', `三分钟读完一篇论文：${v['paper-zh']}`, ['开场'], 'opening',
  { institution: v.institution, title: v.paper, titleZh: v['paper-zh'], authors: v.authors, venue: `arXiv ${v.arxiv} · ${v.year}` }, [OPENING],
  `翰林院传达室的信使猫标志，旁边是“三分钟读完一篇论文”和“翰林院传达室”；下方是今天的论文：${v.institution}，${v.paper}（${v['paper-zh']}），arXiv ${v.arxiv}。`)
for (const [key, title, stepTitles] of PAGES) {
  page(key, title, stepTitles, key, { label: title }, stepTitles.map(s => `TODO ${s}：一句到两句讲稿，25 到 60 字。`), `TODO：这一页最后一步的画面，用文字描述。`)
}
const notes = 'notes--text'
blocks[notes] = { id: notes, type: 'text', only: ['web'], content: [
  { id: 'notes--t0', type: 'heading', level: 3, children: [text('论文')] },
  { id: 'notes--t1', type: 'paragraph', children: [text(`${v.authors}. ${v.paper}. arXiv ${v.arxiv}, ${v.year}.`)] },
  { id: 'notes--t2', type: 'heading', level: 3, children: [text('画面里的数字从哪里来')] },
  { id: 'notes--t3', type: 'paragraph', children: [text('TODO：每个上屏数字的来源（scenes/data/derive.py）与论文值的对照；示意与估算各是哪些。')] },
] }
// The sources are a reading-only page (a scrolly page shows only its figures and narration). The lecture still plays
// its one step, so production gives that step no hold: the video ends on the takeaway.
sections['p-notes'] = { id: 'p-notes', title: '来源与说明', level: 2, children: [notes], stepOrder: ['notes--step-0'], layout: { type: 'stack' } }
steps['notes--step-0'] = { id: 'notes--step-0', sectionId: 'p-notes', visuals: [{ blockId: notes, visible: true }], narrationIds: [] }
order.push('p-notes')

const doc = {
  schemaVersion: 1, id: slug,
  metadata: {
    title: v.title, lang: 'zh-CN', description: `TODO：一句话说清这篇论文解决什么、怎样做到（三分钟读完 ${v.paper}，${v.institution}，${v.year}）。`,
    tags: ['论文'], plugins: ['@lincyaw/addon-motion', '@lincyaw/addon-lecture', '@lincyaw/addon-speech'], renderers: { web: {}, slides: {}, lecture: {} },
  },
  sectionOrder: order, sections, blocks, steps, narrations, assets: {}, definitions,
  production: {
    defaults: { voiceSource: { type: 'tts', voice: { engine: 'edge', voice: 'zh-CN-XiaoxiaoNeural' } }, narrationStart: 'with-animation', trailingPauseMs: 350 },
    stepOverrides: { 'close--step-1': { minimumHoldMs: 0, trailingPauseMs: 3500 }, 'notes--step-0': { voiceSource: { type: 'none' }, minimumHoldMs: 0, trailingPauseMs: 0 } }, mediaClips: [],
  },
}

mkdirSync(join(dir, 'scenes', 'data'), { recursive: true })
mkdirSync(join(dir, 'figures'), { recursive: true })
writeFileSync(join(dir, 'lecture.json'), JSON.stringify(doc, null, 1) + '\n')
writeFileSync(join(dir, 'scenes', 'opening.ts'), "export { default } from '../../kit/opening.ts'\n")
writeFileSync(join(dir, 'scenes', 'paper.ts'), `// The data and the colours every scene of this film shares. Every number on screen is read from data/*.json, which
// data/derive.py computes from the paper's released results (or, without them, copies from the paper with its table).

export const PAPER = {
  short: ${JSON.stringify(v.paper)},
  title: ${JSON.stringify(v.paper)},
  zh: ${JSON.stringify(v['paper-zh'])},
  authors: ${JSON.stringify(`${v.authors} · ${v.institution}`)},
  arxiv: ${JSON.stringify(`arXiv ${v.arxiv}`)},
}

// TODO: import data from './data/<name>.json' and export it typed; the paper's own colours by meaning (its methods,
// its baseline, its result), so a crop of a figure and the animation share one legend.
`)
for (const [key] of PAGES) {
  writeFileSync(join(dir, 'scenes', `${key}.ts`), `import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, escape, frame, TYPE } from '../../kit/frame.ts'
import { PAPER } from './paper.ts'

// TODO: the ${key} page's scene. A placeholder until then: the page title and the current state, so the document
// compiles and every step can be previewed and timed.
export default gsapScene(({ root, gsap, parameters, state }) => {
  frame(root, \`.ph { position: absolute; inset: 30cqh 8cqw auto; font-size: \${TYPE.title}cqw; font-weight: 800; color: var(--pm-color-muted); }
    .ph span { display: block; margin-top: 2cqh; font-size: \${TYPE.body}cqw; font-weight: 500; }\`,
  \`\${brand(PAPER.short)}<div class="ph">\${escape(String(parameters.label ?? '${key}'))}<span>状态 \${escape(String(state ?? ''))} · 待制作</span></div>\`)
  return gsap.timeline()
})
`)
}
writeFileSync(join(dir, 'scenes', 'data', 'derive.py'), `#!/usr/bin/env python3
"""Every number the scenes of this film draw, computed from the paper's released data.

    uv run --no-project --with numpy --with pandas python -I ${slug}/scenes/data/derive.py <data dir> <out.json>

Print each number the film quotes next to the paper's value; a number that does not match is not put on screen.
"""
# TODO
`)
writeFileSync(join(dir, 'storyboard.md'), `# 分镜：${v['paper-zh']}（${v.paper}，arXiv ${v.arxiv}）

每个参与制作的 agent 开工前读这份文件，改动后再读一遍。讲稿在 \`lecture.json\` 的 \`narrations\` 里，这里的“讲稿要点”只是对照；数字一律来自 \`scenes/data/\`。

## A. 简报

- **类型**：论文讲解视频，三分钟（讲稿约 780 字，含开场白），主要形式是配音视频（\`lecture\`），同时是网页（scrolly）和幻灯片。
- **观众**：TODO（谁，已经知道什么）。
- **看之前**：TODO（观众现在以为什么）。
- **看之后**能复述：
  1. 问题：TODO；
  2. 为什么重要：TODO；
  3. 办法：TODO；
  4. 证据：TODO；
  5. 条件：TODO。
- **固定要求**：开场白“${OPENING}”；先讲问题、为什么重要、论文要解决什么，再展开；论文原图裁切后一次只放一张，配我们的动画讲解。

## B. 论点

看完后，观众明白 TODO（25 字以内），因为他们看到了 TODO（一个会变化的可见属性）。

ABT：TODO，而且 TODO；但是 TODO；所以 TODO。

## C. 画面约定

- 16:9 画面用容器单位（cqw、cqh），SVG 层的坐标是 160 × 90（\`kit/frame.ts\`）。
- 要读的东西（坐标轴、刻度、关键数字）放在 78cqh 以上，下面是字幕带。
- 左边是图，右边（约 66cqw 起）是关键词和读数。
- 左上角固定是品牌角标 \`brand(PAPER.short)\`（开场页除外）。
- 论文原图：TODO（哪几张、在哪一步、镜头框哪个区域）。

## D. 颜色（一种颜色一个意思，和论文图一致）

| 颜色 | 意思 |
|---|---|
| TODO | TODO |

## E. 术语表（全片只用左列）

| 概念 | 用词 | 不用 |
|---|---|---|
| TODO | TODO | TODO |

## F. 定义表（讲稿中第一次出现时给出定义）

| 术语 | 首次出现 | 定义（讲稿里的说法） |
|---|---|---|
| TODO | TODO | TODO |

## G. 页面与步骤（每一步的结束画面）

| 页 | 步 | 结束画面 | 讲稿要点 |
|---|---|---|---|
| opening | 0 | 品牌卡与今天的论文 | 固定开场白 |
${PAGES.flatMap(([key, , stepTitles]) => stepTitles.map((s, i) => `| ${i === 0 ? key : ''} | ${i} | TODO | ${s} |`)).join('\n')}

## H. 数字的来源

TODO：\`scenes/data/derive.py\` 算出的每个数字与论文值的对照；示意与估算。

## I. 制作规则

- 场景的样子只由时间决定：只用补间（tween）和 \`set\`，不用 \`onUpdate\`、\`call\` 之类的回调（按时间定位时 GSAP 跳过回调）。
- 节拍用 \`clock\` 的 \`T(k, f)\`；\`tools/film.mjs retime\` 把状态时长换成真实配音后，节拍跟着句子走。
- 不用 SVG 的 \`id\` 和 \`url(#…)\`；颜色变化不补间 \`var()\` 或 \`color-mix()\`。
- 只有协调者改 \`lecture.json\`、\`kit/\`、数据模块；每个 agent 只改分给自己的场景文件，保存前确认能编译。
- 看结果用 \`node tools/mcp.mjs capture_slides '{"document":"${slug}","section":"p-<页>"}' --out <目录>\`，再用 \`tools/sheet.py\` 拼成一张。

## J. 评审记录

（每轮评审追加在这里：时间、谁看的、发现、改了什么。）
`)
console.log(`wrote ${slug}/: lecture.json (${order.length} pages), storyboard.md, scenes/ (opening, ${PAGES.map(p => p[0]).join(', ')}, paper.ts), scenes/data/derive.py, figures/`)
console.log(`next: pnpm exec presmium check ${slug} --json; fill storyboard.md A–H; write the narration in lecture.json`)
