<script setup lang="ts">
import { PmButton, PmDialog, PmDrawer, PmMenu, PmPopover, PmSegmented, PmTabs } from '@presmium/host'
import { ref } from 'vue'

const dialog = ref(false)
const drawer = ref(false)
const popover = ref(false)
const tab = ref('one')
const choice = ref('one')
const selected = ref('')
const options = [{ value: 'one', label: '第一项' }, { value: 'two', label: '第二项' }]
</script>

<template>
  <div class="fixture-primitives">
    <PmButton @click="dialog = true">打开弹窗</PmButton>
    <PmDialog v-model:open="dialog" label="设置弹窗" close-label="关闭弹窗">
      <label>姓名<input aria-label="姓名"></label>
      <PmPopover v-model:open="popover" label="更多设置">
        <template #trigger><PmButton @click="popover = !popover">更多设置</PmButton></template>
        <PmButton>浮层操作</PmButton>
      </PmPopover>
    </PmDialog>
    <PmDrawer v-model:open="drawer" label="文稿抽屉" close-label="关闭抽屉">
      <template #trigger><PmButton @click="drawer = true">打开抽屉</PmButton></template>
      <PmButton>抽屉操作</PmButton>
    </PmDrawer>
    <PmMenu label="文稿菜单" :items="[{ id: 'disabled', label: '不可选', disabled: true }, { id: 'copy', label: '复制' }, { id: 'delete', label: '删除' }]" @select="selected = $event" />
    <p role="status">{{ selected }}</p>
    <PmTabs v-model="tab" :tabs="options" label="内容标签"><p>{{ tab === 'one' ? '第一项内容' : '第二项内容' }}</p></PmTabs>
    <PmSegmented v-model="choice" :options="options" label="显示方式" />
  </div>
</template>
