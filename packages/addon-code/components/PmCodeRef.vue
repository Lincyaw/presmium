<script setup lang="ts">
import { PmBoundary, useStepState } from '@presmium/host'
import type { CodeRefView } from '../src/domain/view.ts'

// The bar above a code reference in the slides, inserted by the resolution
// pass (src/node/resolve.ts) with everything resolved at build time.
const props = withDefaults(defineProps<CodeRefView>(), { at: 0, variants: () => [] })

// Version k shows from step `at + k` until the next version.
const shown = props.variants.map((_, k) => useStepState({
  from: k === 0 ? 0 : props.at + k,
  to: k + 1 < props.variants.length ? props.at + k + 1 : undefined,
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
    <div v-else class="pm-coderef" :data-anchor="anchor">
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
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-coderef {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0.25rem;
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
.pm-coderef--error {
  padding: 0.5rem 0.75rem;
  border: 1px dashed #dc2626;
  border-radius: 0.25rem;
  color: #dc2626;
  font-size: 0.85em;
}
</style>
