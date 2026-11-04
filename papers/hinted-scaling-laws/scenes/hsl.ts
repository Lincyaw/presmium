// The data and the colours every scene of this film shares. Every number on screen is read from `data/hsl.json`,
// which `data/derive.py` computes from the paper's released results (github.com/tatsu-lab/hinted-scaling-laws).

import data from './data/hsl.json'
import { ramp, sigmoid, VIRIDIS } from '../../kit/chart.ts'
import { sup } from '../../kit/frame.ts'

export const D = data as unknown as {
  delphi: {
    rungs: { model: string, c: number, acc: number }[]
    methods: Record<'mask' | 'truncate' | 'logit_mix', { hints: number[], acc: (number | null)[][], law: number[], mae: number }>
    forecast_logit: { t: number, boundary: number, frac: number, baseline: [number, number], base_pred: number, base_err: number, laws: Record<string, number[]>, pred: number, err: number }[]
    bpb: { c: number, bpb: number }[]
    sheet: Record<string, Record<string, Record<string, string>>>
  }
  families: { panels: { bench: string, family: string, name: string, t: number, frac: number, base_err: number, err: number, truth: number }[], wins: number, median_base: number, median_ens: number }
  answer_mix: { rows: { t: number, err: number, pred: number }[] }
  ranking: Record<'aime' | 'hle', { models: string[], truth: number[], curves: Record<string, number[]>, levels: number[], budgets: number[], avg: number[], prior: number[], single: Record<string, number> }>
  problem: { id: string, question: string, answer: string, solution: string }
}

export const PAPER = {
  short: 'Hinted Scaling Laws',
  title: 'Hinted Scaling Laws',
  zh: '带提示的缩放定律',
  authors: 'Suze van Adrichem, Luke Bailey, Rohith Kuditipudi 等 · Stanford',
  arxiv: 'arXiv 2611.02270',
  code: 'github.com/tatsu-lab/hinted-scaling-laws',
}

/** The floored sigmoid law of the paper's Eq. (2), b = [β₁, β₂, β₀, A, L, F], with the scale axis centred at 10²⁰. */
export function law(b: readonly number[], c: number, h: number): number {
  const z = b[0]! * (c - 20) + b[1]! * h + b[2]!
  return Math.max(b[5]!, b[4]! + (b[3]! - b[4]!) * sigmoid(z))
}

/** The standard scaling law: a sigmoid in scale alone, fitted to unhinted accuracy. */
export const baseline = (a: readonly number[], c: number) => sigmoid(a[0]! * c + a[1]!)

/** 10²³ for c = 23; 3 × 10¹⁸ style for the rungs that are not whole decades. */
export function flops(c: number): string {
  const n = Math.floor(c + 1e-9), m = 10 ** (c - n)
  return m < 1.05 ? `10${sup(n)}` : `${m.toFixed(1).replace(/\.0$/, '')}×10${sup(n)}`
}

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

/** The paper's colours for its three ways of hinting (its Fig. 1). */
export const METHOD = { truncate: '#1a73b5', mask: '#d6620a', logit_mix: '#cc79a7' }

/** The hint level's colour, viridis as in the paper; on a dark page the darkest part is skipped so it stays visible. */
export const hintColor = (t: number, dark: boolean) => ramp(VIRIDIS, (dark ? 0.28 : 0.08) + t * (dark ? 0.72 : 0.9))

/** A model's colour by its scale, light to dark orange as in the paper's Fig. 2. */
export const ORANGES = ['#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704']

/** Accuracy as the paper's Fig. 3 colours it (white through orange and red to black). */
export const HEAT = ['#fee8d3', '#fdc794', '#fd9a4c', '#ff6f00', '#f64900', '#db2500', '#c00100', '#a40000', '#6c0000', '#340000', '#0b0b0b']
