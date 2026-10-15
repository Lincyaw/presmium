/**
 * Texts the dev-server endpoints send back, in zh-CN and en (N-07). The page
 * asks for its language with Accept-Language (src/client/local-env.ts); each
 * request is handled with its texts, and code outside a request (compile
 * time) gets zh-CN.
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
}

const requested = new AsyncLocalStorage<ServerMessages>()

/** Runs `task` with the texts of the language a request's Accept-Language names; zh-CN unless it names another. */
export function inLanguage<T>(acceptLanguage: string | undefined, task: () => T): T {
  return requested.run(acceptLanguage && !/^zh\b/i.test(acceptLanguage.trim()) ? en : zhCN, task)
}

/** The texts of the request being handled. */
export function text(): ServerMessages {
  return requested.getStore() ?? zhCN
}
