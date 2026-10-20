import { currentLocale, useMessages as useCatalog } from '@lincyaw/host'
import type { Catalog } from '@lincyaw/host'
import type { ComputedRef } from 'vue'

const zhCN = {
  container: (definition: string) => `容器：${definition}`,
  edit: '编辑',
  editFile: (file: string) => `编辑 ${file}`,
  running: '运行中……',
  runInContainer: '在容器中运行',
  replicate: '导出环境',
  timedOut: '（运行超时，已停止）',
  connecting: '正在连接本地环境……',
  pluginOff: '本地环境插件未启用',
  devServerOnly: '本地环境只在开发服务器中可用',
  noEndpoints: '服务器没有提供本地环境接口',
  notAllowed: '只有编辑者可以使用本地环境',
  unreachable: '无法连接服务器',
  requestFailed: (status: number) => `本地环境请求失败（${status}）`,
  noDocker: '未找到可用的 Docker',
  noDefinition: '工作区没有 devcontainer 定义',
  separator: '；',
}

export type LocalEnvMessages = typeof zhCN

const en: LocalEnvMessages = {
  container: definition => `Container: ${definition}`,
  edit: 'Edit',
  editFile: file => `Edit ${file}`,
  running: 'Running…',
  runInContainer: 'Run in container',
  replicate: 'Export environment',
  timedOut: ' (timed out, stopped)',
  connecting: 'Connecting to the local environment…',
  pluginOff: 'The local environment plugin is not enabled',
  devServerOnly: 'The local environment is available only from the dev server',
  noEndpoints: 'The server does not serve the local environment',
  notAllowed: 'Only editors can use the local environment',
  unreachable: 'Cannot reach the server',
  requestFailed: status => `Local environment request failed (${status})`,
  noDocker: 'No Docker found',
  noDefinition: 'The workspace has no devcontainer definition',
  separator: '; ',
}

export const MESSAGES: Catalog<LocalEnvMessages> = { 'zh-CN': zhCN, en }

export function messages(): LocalEnvMessages {
  return MESSAGES[currentLocale()]
}

export function useMessages(): ComputedRef<LocalEnvMessages> {
  return useCatalog(MESSAGES)
}
