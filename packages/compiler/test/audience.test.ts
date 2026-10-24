import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'
import { build, Compiler } from '../src/index.ts'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WORK = join(ROOT, 'e2e/fixtures/regression/.presmium')
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const DECK = `---
title: 受众
plugins:
  - '@lincyaw/addon-core'
renderers:
  slides: {}
---

(cover)=
# 封面

(plan)=
## 安排

:::{audience} teacher
:::

教师专用的安排。

(rules)=
## 规则

:::{slide}
:label: rule-intro
规则。
:::

:::{slide}
:label: teacher-hint
:reveal:
:audience: teacher
教师提示：先请学生猜。
:::

:::{slide}
:label: step-one
:reveal:
第一步。
:::

(ask)=
## 提问

:::{audience} student
:::

只给学生的一节。

(answers)=
## 答疑

:::{audience} teacher
:::

教师专用的答疑。
`

type Slides = { presmiumId?: string, presmiumSteps?: string[][], presmiumBack?: string }
const slidesOf = (doc: IRDocument, id: string) => doc.sections.find(section => section.id === id)?.hints.slides as Slides | undefined

it('writes the keys of following of the student build as it has its steps, naming none of the teachers\' blocks; a teachers\' section goes back to the learners\' own', async () => {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'compiler-audience-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const compilation = await new Compiler(join(dir, 'lecture.md')).compile()
  const whole = compilation.doc
  expect(whole.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  expect(slidesOf(whole, 'rules')).toMatchObject({ presmiumId: 'rules', presmiumSteps: [[], ['teacher-hint'], ['step-one']] })
  expect(slidesOf(whole, 'plan')?.presmiumBack).toBe('cover')
  expect(slidesOf(whole, 'answers')?.presmiumBack).toBe('ask')
  expect(slidesOf(whole, 'ask')?.presmiumBack).toBe('rules')

  const report = await build(compilation, { audience: 'student', to: [], outDir: join(dir, 'student') })
  const text = readFileSync(report.ir, 'utf8')
  const student = JSON.parse(text) as IRDocument
  expect(student.sections.map(section => section.id)).toEqual(['cover', 'rules', 'ask'])
  expect(slidesOf(student, 'rules')).toMatchObject({ presmiumId: 'rules', presmiumSteps: [[], ['step-one']] })
  expect(student.sections.find(section => section.id === 'rules')?.steps).toBe(1)
  expect(slidesOf(student, 'ask')?.presmiumBack).toBe('rules')
  expect(text).not.toContain('teacher-hint')
  expect(text).not.toContain('教师提示')
}, 120_000)
