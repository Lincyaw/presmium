<script setup lang="ts">
import { PmBoundary, useStepState } from '@presmium/host'

interface Variant {
  commit: string
  lines: string
  href?: string
}

interface Step {
  name: string
  lines: string
}

// Rendered by the coderef transform (src/node/transform.ts); everything is resolved at build time.
const props = defineProps<{
  anchor: string
  file?: string
  lines?: string
  commit?: string
  pinned?: boolean
  href?: string
  drift?: 'synced' | 'drifted'
  error?: string
  /** JSON list of versions shown one per step. */
  variants?: string
  /** Click at which Magic Move shows the second version. */
  at?: number
  /** JSON list of the logical units highlighted one per step; given in the document form. */
  steps?: string
}>()

const variants: Variant[] = props.variants ? JSON.parse(props.variants) : []
const steps: Step[] = props.steps ? JSON.parse(props.steps) : []
// Magic Move shows the first version until click `at`, then one more version per click.
const at = props.at ?? 1
const shown = variants.map((_, k) => useStepState({
  from: k === 0 ? 0 : at + k - 1,
  to: k + 1 < variants.length ? at + k : undefined,
}))

function short(commit: string): string {
  return commit.slice(0, 7)
}
</script>

<template>
  <PmBoundary name="PmCodeRef">
    <div v-if="error" class="pm-coderef pm-coderef--error" role="alert" :data-anchor="anchor">
      代码引用 {{ anchor }} 无法显示：{{ error }}
    </div>
    <figure v-else class="pm-coderef" :data-anchor="anchor">
      <figcaption class="pm-coderef__bar">
        <a v-if="href" class="pm-coderef__file" :href="href" target="_blank" rel="noopener" :title="`在仓库中打开 ${file}`">{{ file }}<span v-if="lines">:{{ lines }}</span></a>
        <span v-else class="pm-coderef__file" :title="anchor">{{ file }}<span v-if="lines">:{{ lines }}</span></span>
        <template v-for="(variant, k) in variants" :key="variant.commit">
          <a v-if="variant.href" class="pm-coderef__variant" :href="variant.href" target="_blank" rel="noopener" :data-active="shown[k]?.value.active ? '' : undefined">{{ short(variant.commit) }}</a>
          <span v-else class="pm-coderef__variant" :data-active="shown[k]?.value.active ? '' : undefined">{{ short(variant.commit) }}</span>
        </template>
        <span v-if="!variants.length" class="pm-coderef__commit" :title="commit">{{ commit ? `@ ${short(commit)}` : '工作区' }}</span>
        <span
          v-if="pinned"
          class="pm-coderef__badge"
          :data-drift="drift"
          :title="drift === 'drifted' ? '工作区中的代码已改变，运行 presmium check 查看差异' : '锁定的代码与工作区一致'"
        >{{ drift === 'drifted' ? '已漂移' : '已锁定' }}</span>
      </figcaption>
      <slot />
      <ol v-if="steps.length" class="pm-coderef__steps">
        <li v-for="step in steps" :key="step.name">
          <code>{{ step.name }}</code>：第 {{ step.lines }} 行
        </li>
      </ol>
    </figure>
  </PmBoundary>
</template>

<style scoped>
.pm-coderef {
  margin: 0.5rem 0;
}
.pm-coderef__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 0.7em;
  opacity: 0.85;
}
.pm-coderef__file {
  font-family: var(--slidev-code-font-family, ui-monospace, monospace);
  overflow-wrap: anywhere;
}
.pm-coderef__commit,
.pm-coderef__variant {
  font-family: var(--slidev-code-font-family, ui-monospace, monospace);
  opacity: 0.7;
}
.pm-coderef__variant[data-active] {
  opacity: 1;
  font-weight: 700;
  text-decoration: underline;
}
.pm-coderef__badge {
  padding: 0 0.4em;
  border-radius: 999px;
  border: 1px solid #16a34a;
  color: #16a34a;
}
.pm-coderef__badge[data-drift='drifted'] {
  border-color: #d97706;
  color: #d97706;
}
.pm-coderef__steps {
  margin: 0.25rem 0 0;
  font-size: 0.85em;
}
.pm-coderef--error {
  padding: 0.5rem 0.75rem;
  border: 1px dashed #dc2626;
  border-radius: 0.25rem;
  color: #dc2626;
  font-size: 0.85em;
}
.pm-coderef :deep(pre),
.pm-coderef :deep(.slidev-code-wrapper) {
  margin-top: 0;
}
</style>
