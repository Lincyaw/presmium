/**
 * UI strings of the local environment in zh-CN and en (N-07), in the UI
 * language of @presmium/host: `useMessages()` in components, `messages()`
 * where a string is needed outside them; requests to the dev-server
 * endpoints ask for answers in it (`language()`).
 */
import { currentLocale, useMessages as useCatalog } from '@presmium/host'
import type { Catalog, Locale } from '@presmium/host'
import type { ComputedRef } from 'vue'

const zhCN = {
  container: (definition: string) => `容器：${definition}`,
  edit: '编辑',
  editFile: (file: string) => `编辑 ${file}`,
  running: '运行中……',
  runInContainer: '在容器中运行',
  commit: '提交到新分支',
  replicate: '导出环境',
  timedOut: '（运行超时，已停止）',
  committedTo: '已提交到分支',
  committedFrom: (commit: string, base: string) => `（${commit}），${base} 保持不变`,
  connecting: '正在连接本地环境……',
  pluginOff: '本地环境插件未启用',
  devServerOnly: '本地环境只在开发服务器中可用',
  noEndpoints: '开发服务器没有提供本地环境接口',
  unreachable: '无法连接开发服务器',
  requestFailed: (status: number) => `本地环境请求失败（${status}）`,
  noDocker: '未找到可用的 Docker',
  noDefinition: '工作区没有 devcontainer 定义',
  noGit: '工作区不在有提交的 git 仓库中',
  separator: '；',
}

export type LocalEnvMessages = typeof zhCN

const en: LocalEnvMessages = {
  container: definition => `Container: ${definition}`,
  edit: 'Edit',
  editFile: file => `Edit ${file}`,
  running: 'Running…',
  runInContainer: 'Run in container',
  commit: 'Commit to a new branch',
  replicate: 'Export environment',
  timedOut: ' (timed out, stopped)',
  committedTo: 'Committed to branch',
  committedFrom: (commit, base) => ` (${commit}); ${base} is unchanged`,
  connecting: 'Connecting to the local environment…',
  pluginOff: 'The local environment plugin is not enabled',
  devServerOnly: 'The local environment is available only from the dev server',
  noEndpoints: 'The dev server does not serve the local environment',
  unreachable: 'Cannot reach the dev server',
  requestFailed: status => `Local environment request failed (${status})`,
  noDocker: 'No Docker found',
  noDefinition: 'The workspace has no devcontainer definition',
  noGit: 'The workspace is not in a git repository with commits',
  separator: '; ',
}

export const MESSAGES: Catalog<LocalEnvMessages> = { 'zh-CN': zhCN, en }

/** The UI language, in which the client asks the dev-server endpoints to answer. */
export function language(): Locale {
  return currentLocale()
}

/** The strings of the UI language, read when a string is needed. */
export function messages(): LocalEnvMessages {
  return MESSAGES[currentLocale()]
}

/** For components: the strings, following the UI language. */
export function useMessages(): ComputedRef<LocalEnvMessages> {
  return useCatalog(MESSAGES)
}
