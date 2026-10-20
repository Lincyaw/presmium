import { AsyncLocalStorage } from 'node:async_hooks'
import { deckLocale } from '@lincyaw/kernel'

const zhCN = {
  noDefinition: '工作区没有 devcontainer 定义',
  unreadableDefinition: '无法读取 devcontainer 定义，请确认 Docker 可用',
  unsupportedLanguage: (lang: string) => `容器执行器不支持语言 ${lang}`,
  buildFailed: (detail: string) => `devcontainer build 失败：${detail}`,
  outsideWorkspace: (file: string) => `路径必须位于工作区内：${file}`,
  notJson: '请求体必须是 JSON',
  invalidJson: '请求体不是有效的 JSON',
  notObject: '请求体必须是 JSON 对象',
  missingField: (key: string) => `缺少字段 ${key}`,
  notString: (key: string) => `字段 ${key} 必须是字符串`,
  notStringTable: (key: string) => `字段 ${key} 必须是字符串表`,
  runTitle: (lang: string) => `在本地环境的容器中运行一段 ${lang} 代码`,
  notAllowed: '没有得到运行的许可',
  readme: (file: string, run?: string) => [
    '# Presmium 导出的运行环境',
    '',
    `本压缩包包含演示中的代码片段 \`${file}\` 与仓库的 devcontainer 定义。`,
    '',
    '用 Dev Containers CLI 打开并运行：',
    '',
    '```sh',
    'devcontainer up --workspace-folder .',
    `devcontainer exec --workspace-folder . ${run ?? `<运行 ${file} 的命令>`}`,
    '```',
    '',
    '也可以在 VS Code 中打开本目录，选择“Reopen in Container”。',
    '',
  ].join('\n'),
}

export type ServerMessages = typeof zhCN

const en: ServerMessages = {
  noDefinition: 'The workspace has no devcontainer definition',
  unreadableDefinition: 'Cannot read the devcontainer definition; check that Docker is available',
  unsupportedLanguage: lang => `The container executor does not run ${lang}`,
  buildFailed: detail => `devcontainer build failed: ${detail}`,
  outsideWorkspace: file => `The path must be inside the workspace: ${file}`,
  notJson: 'The request body must be JSON',
  invalidJson: 'The request body is not valid JSON',
  notObject: 'The request body must be a JSON object',
  missingField: key => `Missing field ${key}`,
  notString: key => `Field ${key} must be a string`,
  notStringTable: key => `Field ${key} must map names to strings`,
  runTitle: lang => `Run ${lang} code in the local environment's container`,
  notAllowed: 'The run was not allowed',
  readme: (file, run) => [
    '# Environment exported by Presmium',
    '',
    `This archive holds the snippet \`${file}\` from the presentation and the repository's devcontainer definition.`,
    '',
    'Open and run it with the Dev Containers CLI:',
    '',
    '```sh',
    'devcontainer up --workspace-folder .',
    `devcontainer exec --workspace-folder . ${run ?? `<command that runs ${file}>`}`,
    '```',
    '',
    'You can also open this folder in VS Code and choose "Reopen in Container".',
    '',
  ].join('\n'),
}

const MESSAGES = { 'zh-CN': zhCN, en }

const requested = new AsyncLocalStorage<ServerMessages>()

export function inLanguage<T>(language: string | undefined, task: () => T): T {
  return requested.run(MESSAGES[deckLocale(language?.trim())], task)
}

export function text(): ServerMessages {
  return requested.getStore() ?? en
}
