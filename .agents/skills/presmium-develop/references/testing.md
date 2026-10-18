# 验证用户能完成的行为

先写清触发操作与期望结果，再选最低成本、但真实经过相关边界的测试。只写集成测试，不写单元测试，不 mock Slidev、VitePress 等宿主框架；每个行为一到两个用例。

## 按失败发生的位置选用例

| 要验证的变化 | 测什么 | 从哪里开始 |
|---|---|---|
| 指令、步骤、诊断、录制缓存 | 用真实 CLI 处理文稿，检查 IR、诊断或产物 | `packages/cli/test/ir.test.ts`、`packages/addon-exec/test/compile.test.ts` |
| 组件显示、键盘与步骤回退 | 构建后在浏览器执行操作，比较用户能看到的状态 | `e2e/guide.spec.ts` |
| 保存后更新预览 | 起开发服务，编辑文件，检查内容与当前位置 | `e2e/viewer.spec.ts`、`e2e/workbench.spec.ts` |
| 学生版、译本、文件发布 | 构建对应版本，读回实际写出的文件 | `packages/cli/test/audience.test.ts`、`e2e/site.spec.ts` |
| 服务端路由、确认、MCP | 启动服务，从真实客户端请求并检查响应和副作用 | `packages/server/test/`、`packages/mcp/test/` |
| 包加载、对等依赖、安装路径 | 在单仓之外安装后运行 | `packages/cli/test/consumer.test.ts`、`e2e/consumer.spec.ts` |
| dsh 集成与升级 | 按受影响边界选择升级闸门 | `docs/design-dsh.md` 的版本与测试部分 |

断言用户关心的结果，例如“后退后恢复原画面”“学生产物不含教师内容”。避免只断言某个内部函数被调用，或让测试逐行复述实现。

## CLI 集成测试怎样写

不需要浏览器的用例放在 `packages/<包>/test/*.test.ts`。把最小文稿写进临时目录，插件用绝对路径，渲染端可用 `renderers.<id>.package` 指向包目录。

`@presmium/cli/testing` 的 `presmium(cwd, args, env?)` 真正启动 CLI，返回 `{ code, stdout, stderr }`。先断言退出码，并把标准输出与标准错误作为失败信息；再读回 IR 或产物验证结果。该辅助工具去掉测试进程的 `NODE_ENV=test`，避免构建模式与使用者不同。

示例模式：

```ts
const result = await presmium(dir, ['build', '--to', 'notebook'])
expect(result.code, result.stdout + result.stderr).toBe(0)
const notebook = JSON.parse(readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8'))
expect(JSON.stringify(notebook.cells)).toContain('预期的降级内容')
```

需要给包增加 `@presmium/cli` 开发依赖时先检查依赖方向。`mcp`、`server` 的测试直接启动 CLI 可执行文件，避免 `cli → server → mcp` 的链接成环。

## 浏览器用例怎样准备文稿

专用文稿放在 `e2e/fixtures/<组>/`，用例放在 `e2e/<组>.spec.ts`。从 `./fixtures/deck.ts` 导入 `useFixture`，它在 `beforeAll` 构建并服务文稿，在 `afterAll` 清理。用例使用 `test.describe.configure({ mode: 'default' })`，让同组文稿只构建一次。

`useFixture(name, options?)` 返回取得文稿的函数；`deck().web`、`deck().slides` 是地址，`deck().slide(id)` 用稳定的章节标签找页号。需要手动控制生命周期时用同文件的 `buildFixture` 并调用 `close()`。

按任务选择选项：

- `to`：只构建需要的媒介。
- `audience`：构建指定受众，例如学生版。
- `edit(dir)`：修改复制后的文稿，不改公共样例。
- `with`：带上额外 fixture 文件。
- `link`：给文稿链接示例项目依赖中没有的插件；具体形状读辅助工具的类型。

组件跨网页与幻灯片共用时，两边都走关键操作。步骤相关的功能至少验证前进后退或直接跳转所得的状态一致。静态降级用实际 notebook、PDF 或浏览器打印产物验证。

## 外部条件和进程

用例启动自己的服务、临时目录与端口，记录 PID 并在结束时关闭。不复用、不停止其他任务的服务器，不用 `pkill -f` 或 `killall`。

浏览器端口通过 `PRESMIUM_E2E_SLIDES_PORT`、`PRESMIUM_E2E_WEB_PORT` 区分并行检出。静态服务器重建后要重启；运行中的开发服务则应由被测试的实时更新机制处理。

工作台用例另设 `PRESMIUM_E2E_STUDIO_PORT_OFFSET`，给各 Studio 端口加同一个偏移量，避免与其他任务的 Harness 服务冲突。

需要 Docker、GPU、凭据时，缺少条件就明确跳过并说明原因。复用已有的启动辅助，避免在测试中建立第二套协议：

- 远端内核：`packages/addon-exec-jupyter/test/helpers.ts`、`e2e/fixtures/exec-remote/jupyter.ts`。
- 语音：`packages/addon-speech/test/helpers.ts` 的假引擎，经真实服务端口使用；固定输出用于验证缓存、转写与合成流程。
- 课堂：`e2e/fixtures/plugins/decks.ts` 的课堂服务辅助，用独立浏览器身份验证主讲与学生。
- dsh：`packages/dsh/test/harness.ts`，每个用例自己的目录与脚本化模型。

## 运行与判断

先运行改动对应的文件，例如 `pnpm exec vitest run packages/cli/test/ir.test.ts` 或 `pnpm exec playwright test e2e/guide.spec.ts --project chromium`。

`pnpm test` 包含结构检查与 Vitest。PDF 导出相关文件在 `export` 项目，排在其他集成测试之后；单独运行用 `pnpm exec vitest run --project export`，避免同时大量构建导致截图时机不稳定。

端到端前先构建示例 `pnpm demo:build`，专用文稿由 fixture 自己构建。`pnpm e2e` 的完整 Chromium 用例之外，Firefox、WebKit 默认只跑冒烟；缺少浏览器或系统条件会提示跳过。报告时区分通过、跳过与未运行。

性能用例排在其他 Chromium 用例之后；单独运行用 `pnpm exec playwright test e2e/perf.spec.ts --no-deps`，否则会先运行 Chromium 全套。

全部验证用 `pnpm verify`。通过后说明验证覆盖的用户行为；还有未验证的外部条件时明确保留限制。
