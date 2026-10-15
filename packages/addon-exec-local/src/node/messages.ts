/**
 * Texts the node side writes, in zh-CN and en (N-07): the answers of the
 * dev-server endpoints, in the language the page asks for with
 * Accept-Language (src/client/local-env.ts); the commit message and the README
 * of an exported environment, in that language or, for the archive built at
 * compile time, in the deck's `lang`. The container executor's messages at
 * compile time are English, like those of the other compile-time executors.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const zhCN = {
  noDefinition: '工作区没有 devcontainer 定义',
  unreadableDefinition: '无法读取 devcontainer 定义，请确认 Docker 可用',
  unsupportedLanguage: (lang: string) => `容器执行器不支持语言 ${lang}`,
  buildFailed: (detail: string) => `devcontainer build 失败：${detail}`,
  notInGit: '工作区不在 git 仓库中，或仓库还没有提交',
  invalidBranch: (branch: string) => `分支名无效：${branch}`,
  branchExists: (branch: string) => `分支已存在：${branch}`,
  noSuchFile: (file: string) => `文件不存在：${file}`,
  outsideWorkspace: (file: string) => `路径必须位于工作区内：${file}`,
  unknownEndpoint: (route: string) => `未知的本地环境接口：${route}`,
  notJson: '请求体必须是 JSON',
  tooLarge: '请求体过大',
  invalidJson: '请求体不是有效的 JSON',
  notObject: '请求体必须是 JSON 对象',
  missingField: (key: string) => `缺少字段 ${key}`,
  notString: (key: string) => `字段 ${key} 必须是字符串`,
  notStringTable: (key: string) => `字段 ${key} 必须是字符串表`,
  commitMessage: (file: string) => `presmium: 演示中修改 ${file}`,
  /** README of the exported environment (P-26); `run` is the command that runs the snippet, when known. */
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
  notInGit: 'The workspace is not in a git repository, or the repository has no commit yet',
  invalidBranch: branch => `Invalid branch name: ${branch}`,
  branchExists: branch => `The branch already exists: ${branch}`,
  noSuchFile: file => `No such file: ${file}`,
  outsideWorkspace: file => `The path must be inside the workspace: ${file}`,
  unknownEndpoint: route => `Unknown local environment endpoint: ${route}`,
  notJson: 'The request body must be JSON',
  tooLarge: 'The request body is too large',
  invalidJson: 'The request body is not valid JSON',
  notObject: 'The request body must be a JSON object',
  missingField: key => `Missing field ${key}`,
  notString: key => `Field ${key} must be a string`,
  notStringTable: key => `Field ${key} must map names to strings`,
  commitMessage: file => `presmium: edit ${file} during the presentation`,
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

const requested = new AsyncLocalStorage<ServerMessages>()

/**
 * Runs `task` with the texts of a language: a request's Accept-Language or a
 * deck's `lang`. Chinese for zh-*, and when none is named (the default deck
 * language); English otherwise.
 */
export function inLanguage<T>(language: string | undefined, task: () => T): T {
  return requested.run(language?.trim() && !/^zh\b/i.test(language.trim()) ? en : zhCN, task)
}

/** The texts of the request or deck being handled; English elsewhere (the container executor at compile time). */
export function text(): ServerMessages {
  return requested.getStore() ?? en
}
