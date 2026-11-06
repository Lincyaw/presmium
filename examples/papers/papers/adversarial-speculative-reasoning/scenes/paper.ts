// The data and colours every scene shares. The paper links no released results repository, so
// derive.py records the text/table values and checks every arithmetic relation used on screen.

import data from './data/asr.json'

export const PAPER = {
  short: 'Adversarial Speculation',
  title: 'Adversarial Speculative Reasoning',
  zh: '对抗式推测推理',
  authors: 'Hongyin Luo, Wei Fang, Lijie Yang 等 · Subconscious Systems、MIT、普林斯顿大学与东北大学',
  arxiv: 'arXiv 2611.05345',
}

/** Paper-native terms. Keep these in English so viewers can match the video to the source. */
export const TERMS = {
  speculativeDecoding: 'speculative decoding',
  draftModel: 'draft model',
  targetModel: 'target model',
  verificationBlock: 'verification block',
  verificationSlot: 'verification slot',
  exactVerification: 'exact verification',
  residualDistribution: 'residual distribution',
  outputDistribution: 'output distribution',
  committingSentence: 'committing sentence',
  decisionPoint: 'decision point',
  decisionFrame: 'decision frame',
  forkPair: 'fork pair',
  preferencePair: 'preference pair',
  heldOutPreferenceAccuracy: 'held-out preference accuracy',
  contextPrecision: 'context precision',
  acceptedLength: 'accepted length',
} as const

export const D = data as unknown as {
  source: string
  precision: {
    slots: number[]
    glm: { relative: number[], slope: number, relative_per_slot: number, mean: number[], shift2: number[], shift3: number[] }
    deepseek: { relative: number[], slope: number, relative_per_slot: number, shift1: number[], shift2: number[] }
    first_slot_reference: { verify: number, decode: number }
    long_horizon: { bins: string[], ratio_gt4: number[], independent_ratio_gt4: number, onset_turns: number, excess: number[] }
  }
  preferences: { key: string, model: string, forward: number, adversarial: number, used: boolean, median_forward?: number, median_adversarial?: number }[]
  results: {
    benchmark: string
    tasks: number
    model: string
    base: number
    adversarial: number
    delta: number
    calculated_delta?: number
    ci?: number[]
    p?: number
    figure?: { base: number, adversarial: number }
  }[]
  controls: {
    preferred: { model: string, delta: number }[]
    adversarial: { model: string, delta: number }[]
    unrelated: { runs: number, base: number, pooled: number, delta: number, p: number }
  }
  speed: {
    glm: { accepted_before: number, accepted_after: number }
    deepseek: { accepted_before: number, accepted_after: number }
    drop: number
    paper_approximation: number
  }
  training: {
    glm: { target_b: number, draft_b: number, trainable_b: number, fraction: number }
    deepseek: { target_b: number, draft_b: number, trainable_b: number, fraction: number }
    fraction_range: [number, number]
  }
}

/** A rate in 0..1 as a percentage. */
export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`

/** A pass rate already written in percentage points. */
export const point = (value: number, digits = 1) => `${value.toFixed(digits)}%`

export const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`

export const modelName = (name: string) => ({
  'GLM-5.3-NVFP4': 'GLM-5.3',
  'DeepSeek-V4.1-Flash': 'DeepSeek-V4.1',
}[name] ?? name)

export const PREFERENCE_LABEL: Record<string, string> = {
  run_tests: 'run tests（运行测试）',
  decision_frame: 'decision frame（决策框架）',
  thinking_length: 'thinking length（思考长度）',
  decision_correctness: 'decision correctness（决定是否正确）',
}

export const PAPER_COLOURS = `
  --c-target: var(--pm-color-category-1);
  --c-target-soft: var(--pm-color-category-1-soft);
  --c-draft: var(--pm-color-category-2);
  --c-draft-soft: var(--pm-color-category-2-soft);
  --c-precise: var(--pm-color-category-1);
  --c-noisy: var(--pm-color-category-2);
  --c-reject: var(--pm-color-danger);
  --c-accept: var(--pm-color-ok);
  --c-baseline: var(--pm-color-muted);
`
