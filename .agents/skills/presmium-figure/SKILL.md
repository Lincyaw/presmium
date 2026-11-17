---
name: presmium-figure
description: "Draw SVG figures (diagrams, schematics, charts for a paper, a slide or a post) as React components in a Presmium lecture.json document, build them up step by step like slide builds, and export each step as a standalone SVG file. Use when the person wants SVG graphics, vector figures, a diagram that grows or changes over several pictures, or 'export every step as SVG'. 画 SVG 图形、矢量图、示意图，按步骤逐步增加或修改，每一步导出一张 SVG 时使用。"
---

# Step-built SVG figures

A figure is a React component that returns one `<svg data-figure="name">`. The document's steps tell it which picture to draw, the way a slide build adds or changes one thing per click. `presmium-export --format svg` writes the figure at each step as its own `.svg` file: only the figure, not the page around it, with the look written on each element, so the file opens the same in a browser, Figma, Inkscape or Illustrator.

For moving animation (motion between states, timelines, narration) use the `presmium-animate` skill instead. A figure has no motion: each step is a still picture.

## 1. Plan the pictures

Write down the pictures in order before any code, one line each: what is added or changed in it. Give each picture a short state ID (`input`, `model`, `output`, `focus`). One figure, one idea; a second idea is a second figure.

Each picture must be drawable from its state ID alone: the component must not remember the previous step. Going back to step 2 draws exactly picture 2.

## 2. Write the component

Put it in a project file such as `figures/Pipeline.tsx`. Read the current state with `useStepScope()` from `@lincyaw/host` and draw from it:

```tsx
import { useStepScope } from '@lincyaw/host'
import './figure.css'

const ORDER = ['input', 'model', 'output', 'focus'] as const

export default function Pipeline({ title = 'Pipeline' }: { title?: string }) {
  const state = (useStepScope().state ?? 'focus') as typeof ORDER[number]
  const shown = ORDER.indexOf(state)
  return (
    <svg data-figure="pipeline" className="figure" viewBox="0 0 600 160" role="img" aria-label={title}>
      {shown >= 0 && <rect x="20" y="50" width="160" height="60" rx="10" />}
      {shown >= 1 && <rect x="220" y="50" width="160" height="60" rx="10" className={state === 'focus' ? 'is-focus' : undefined} />}
      {/* … one element group per picture */}
    </svg>
  )
}
```

Rules:

- The root element is one `<svg>` with `data-figure="<name>"` and a `viewBox`. The name becomes the file name; use lowercase words with hyphens, unique in the document. A figure without `data-figure` is not exported.
- Without a state (the reading page shows the whole figure) draw the last picture.
- Draw elements only from the state; add an element by rendering it, remove it by not rendering it. Change a look by changing a class or attribute.
- Style with a CSS file next to the component and the design tokens (`var(--pm-color-accent)`, `var(--pm-color-ink)`, `var(--pm-color-line-strong)`, `var(--pm-color-bg)`, `var(--pm-color-accent-soft)`, `var(--pm-font-sans)`). The export resolves them to plain colors; `--dark` exports the dark palette.
- Text stays text in the SVG. The file names the font but does not embed it; where the font is missing, the viewer substitutes one. Leave room in boxes for that.
- Pictures (`<image href>`) are embedded into the file as data.
- Give `<marker>`, gradient and pattern IDs a prefix of the figure's name, since several figures share one page.
- Do not give the definition a static `fallback`: the print page that the export reads shows a component's fallback instead of the component.

## 3. Register it in the document

In `lecture.json`, add a definition, a component block that uses it, and one step per picture that sets the block's state. The complete working document is in [example/lecture.json](example/lecture.json), its component in [example/figures/Pipeline.tsx](example/figures/Pipeline.tsx):

```json
"definitions": {
  "pipeline-definition": {
    "id": "pipeline-definition", "kind": "component", "schemaVersion": 1,
    "implementation": { "type": "file", "path": "figures/Pipeline.tsx" },
    "parameterSchema": { "type": "object", "properties": { "title": { "type": "string", "title": "Title" } } },
    "states": [{ "id": "input" }, { "id": "model" }, { "id": "output" }, { "id": "focus" }]
  }
},
"blocks": {
  "pipeline-figure": { "id": "pipeline-figure", "type": "component", "definitionId": "pipeline-definition", "parameters": { "title": "Tokens to logits" } }
},
"steps": {
  "pipeline-input": { "id": "pipeline-input", "sectionId": "pipeline", "visuals": [{ "blockId": "pipeline-figure", "visible": true, "state": "input" }], "narrationIds": [] }
}
```

The section lists the steps in order in `stepOrder` and the block in `children`. IDs are unique across the whole document: a definition cannot share its ID with a section. Values that differ per picture (a number, a label) can go in the visual's `parameters`; the component receives them as props.

Run `presmium check` and fix every error before exporting.

## 4. Look, then export

Preview with `presmium dev` and step through the slides forward and backward; each step must show its picture. Then export from the document folder (set up once: `pnpm add -D @lincyaw/addon-publish playwright-chromium` and `pnpm exec playwright install chromium`):

```sh
pnpm exec presmium-export --format svg --output figures-out
```

It writes, for each figure, `<name>-1.svg`, `<name>-2.svg`, … one per step that changes it (a step that leaves the figure as it was writes no new file), or `<name>.svg` when it never changes. Every `.svg` file already in that folder is removed first, so export into a folder of its own. `--range 2,4-5` limits the export to those slides, `--dark` uses the dark palette. In the studio, **Export → Figures as SVG** makes the same files.

The export fails with "the slides draw no figure" when no `<svg data-figure>` was drawn: check the attribute, and that the definition has no `fallback`.

Afterwards open a few of the files on their own (in a browser tab, not inside the slides) and check that every picture is complete and that text fits its boxes.
