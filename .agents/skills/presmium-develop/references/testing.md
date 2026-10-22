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

`@lincyaw/cli/testing` 的 `presmium(cwd, args, env?)` 真正启动 CLI，返回 `{ code, stdout, stderr }`。先断言退出码，并把标准输出与标准错误作为失败信息；再读回 IR 或产物验证结果。该辅助工具去掉测试进程的 `NODE_ENV=test`，避免构建模式与使用者不同。

示例模式：

```ts
const result = await presmium(dir, ['build', '--to', 'notebook'])
expect(result.code, result.stdout + result.stderr).toBe(0)
const notebook = JSON.parse(readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8'))
expect(JSON.stringify(notebook.cells)).toContain('预期的降级内容')
```

需要给包增加 `@lincyaw/cli` 开发依赖时先检查依赖方向。`mcp`、`server` 的测试直接启动 CLI 可执行文件，避免 `cli → server → mcp` 的链接成环。

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

- 远端内核：`packages/addon-exec-jupyter/test/helpers.ts`、`e2e/fixtures/exec-remote/jupyter.ts`。没有 Docker 时，`e2e/exec-remote-cleanup.spec.ts` 可使用本地真实 Jupyter：把 `PRESMIUM_TEST_JUPYTER_PYTHON` 指向已安装 `jupyter_server` 与 `ipykernel` 的 Python，运行 `pnpm exec playwright test e2e/exec-remote-cleanup.spec.ts --project chromium --no-deps --workers=1`。用例创建隔离的服务配置、凭据及目录，验证临时执行、页面导航和关闭后的内核、嵌套目录与终端清理；代理服务在离页检查期间保持运行。缺少该变量时明确跳过，不把跳过计为通过。
- 语音：`packages/addon-speech/test/helpers.ts` 的假引擎，经真实服务端口使用；固定输出用于验证缓存、转写与合成流程。
- 课堂：`e2e/fixtures/plugins/decks.ts` 的课堂服务辅助，用独立浏览器身份验证主讲与学生。
- dsh：`packages/dsh/test/harness.ts`，每个用例自己的目录与脚本化模型。

Jupyter 的本地完整功能检查复用同一个隔离 Python，依次运行，保持单个 worker：

- `packages/addon-exec-jupyter/test/local.test.ts` 用真实服务验证提供方协议、错误与取消、指令诊断、notebook 校验、重放与缓存；Python 另需 `nbformat`、`nbclient`。运行 `pnpm exec vitest run --project integration packages/addon-exec-jupyter/test/local.test.ts --maxWorkers=1 --no-file-parallelism`。
- `e2e/exec-remote-local.spec.ts` 验证代理、静态网页与幻灯片、`prompt` 和 `none`、令牌重试与浏览器会话隔离；只构建其最小文稿。
- `e2e/exec-remote-hub-local.spec.ts` 验证真实 JupyterHub 用户发现与 `/user/<名字>/` 路由。Python 另需 `jupyterhub`，`PRESMIUM_TEST_JUPYTER_PROXY` 指向 `configurable-http-proxy` 的 JavaScript 入口，不能指向包管理器生成的 shell 包装脚本。用例自行创建单用户 Hub、代理和用户服务。

后两项用对应文件名运行定向 Playwright，带 `--project chromium --no-deps --workers=1`。服务端原生线程预算仍为 1、libuv 为 2；在本地进程验证通过不代表 Docker 镜像、GPU、gVisor 或 Kubernetes 部署已验证。

## 运行与判断

默认只运行改动对应的文件，例如 `pnpm exec vitest run --project integration packages/cli/test/ir.test.ts --maxWorkers=1 --no-file-parallelism` 或 `pnpm exec playwright test e2e/guide.spec.ts --project chromium --no-deps --workers=1`。只构建这些用例需要的文稿与媒介，并按需运行相关轻量结构检查。定向验证通过后停止，不自动扩大范围。除非用户明确要求全量验证，不运行以下全量命令；收尾和合并前同样遵守此约定。

执行器释放与恢复用 `e2e/exec-lifecycle.spec.ts`：通过真实 Worker 与宿主的 `pagehide`、`pageshow` 处理器检查取消、排队任务及重新运行。排队取消须等两个面板结束并检查未产生成功输出、没有额外 Worker，不能只观察瞬时的 Worker 数为零；合成生命周期事件不等于验证浏览器真正进入与恢复 BFCache。仅检查 WGSL 的计算与降级时用 `e2e/exec-webgpu-smoke.spec.ts`，不连带构建 Python/jax-js 桥接部分；SwiftShader 通过不代表物理 GPU 已验证。离线发布与高对比度可用仅含 core、publish 的 `e2e/publish-smoke.spec.ts`。其余组件按用例名筛选需要的行为，批次通过后不为汇总而重复已过用例；本次范围与限制见 `docs/reports/components-validation-2026-10-21.md`。

`pnpm test` 包含结构检查与 Vitest，测试文件默认使用一个 worker；每个文件会启动真实构建、服务或浏览器，需要控制同时运行的进程数量。PDF 导出相关文件在 `export` 项目，排在其他集成测试之后；单独运行用 `pnpm exec vitest run --project export`，避免同时大量构建导致截图时机不稳定。

定向端到端只构建用例实际需要的示例或专用 fixture，不预先构建全部 17 讲；专用文稿由 fixture 自己构建。用户明确要求全部示例时才运行 `pnpm demo:build`。`pnpm e2e` 的完整 Chromium 用例之外，Firefox、WebKit 默认只跑冒烟；缺少浏览器或系统条件会提示跳过。报告时区分通过、跳过与未运行。

性能用例排在其他 Chromium 用例之后；单独运行用 `pnpm exec playwright test e2e/perf.spec.ts --no-deps`，否则会先运行 Chromium 全套。

工作台打开或切换讲义变慢时，使用 `node scripts/bench-workbench-preview.mjs /private/tmp/preview.json --rounds 3`：只启动一套隔离工作台与 Chromium，分别记录两次首开和三次返回，计时直到预览 ready 且首章节可见。区分预览地址接口的耗时与 iframe 加载耗时，记录系统负载；不要把编译时间当作整页延迟。 缓存优化另外核对同一 iframe/window 被复用、返回时零新增脚本、暂停后文稿组件及控制流停止、隐藏修改恢复为最新内容、两帧上限与未通过包级／内核插件 `restartable` 双重准入时的销毁退路（包括没有内核插件的 viewer-only 包）；定向用例为 `e2e/preview-cache.spec.ts`。基准同时记录自动化动作总耗时与浏览器真实点击到 ready 的时间，不混用二者。加 `--cs336` 只测真实课程的前两讲和图片。测试与脚本快照隔离工作台客户端，避免并行重建触发 Harness 热替换；并行会话运行定向 Playwright 时用 `--output /private/tmp/<独立目录>` 避免产物冲突。此脚本不构建完整示例或运行测试套件；首次调查见 `docs/benchmarks/workbench-preview-2026-10-21.md`，缓存生命周期、真实 CS336 测量与剩余延迟见 `docs/benchmarks/preview-cache-2026-10-21.md`；报告实际系统负载，不把小文稿或最好一轮当作所有场景都已达到 100 ms。

用户明确要求全部验证时用 `pnpm verify`。报告验证实际覆盖的用户行为，并区分通过、跳过和未运行；还有未验证的外部条件时明确保留限制。
