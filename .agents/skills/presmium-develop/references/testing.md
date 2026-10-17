# 测试

出处：`docs/wbs.md`“测试原则”、`docs/architecture.md` 第 7 节、`CLAUDE.md`。

## 原则

- 只写集成测试，不写单元测试：真正运行 CLI、构建产物、启动服务、打开浏览器；不对单个函数做隔离测试，不用 mock 替代宿主框架（Slidev、VitePress）。
- 每条验收标准一到两个用例，不穷举边界情况。
- 不经过浏览器的集成测试放 `packages/<pkg>/test/*.test.ts`；端到端测试放 `e2e/<ctx>.spec.ts`。
- 需要专用文稿的端到端用例把文稿放在 `e2e/fixtures/<组>/`，在 `beforeAll` 中用真实的 `presmium build` 构建。用例不依赖示例文稿 `examples/demo` 的内容。

## 层级与命令

| 层级 | 命令 | 内容 |
|---|---|---|
| 结构检查 | `pnpm test` | `scripts/check-layering.mjs`（分层）、`scripts/check-skills.mjs`（技能与代码一致）、`scripts/check-plugins.mjs`（Node 插件的 `version` 与 `kernel`） |
| 集成 | `pnpm test` | Vitest：`packages/*/test/**/*.test.ts`，Node 环境，单个用例超时 30 秒。运行 `slidev export` 的三个文件（`render-slides/test/slides.test.ts`、`addon-publish/test/export.test.ts`、`diff.test.ts`）是 `export` 项目，在其他用例（`integration` 项目）之后运行：`slidev export` 等浏览器空闲后打印，机器被构建占满时会在页面就绪前截图或超时（`presmium-export` 与 `presmium-diff` 这时报错退出，不会把缺页的导出当作成功） |
| 检查 | `pnpm demo:check` | 示例文稿 `presmium check` 无错误 |
| 构建 | `pnpm demo:build` | 示例文稿生成网页、幻灯片、notebook，产物在 `examples/demo/dist/<渲染端>/` |
| 端到端 | `pnpm e2e` | Playwright；先 `pnpm demo:build` |
| 全部 | `pnpm verify` | 以上依次执行 |

只跑一个文件：`pnpm exec vitest run packages/addon-code/test/check.test.ts`、`pnpm exec playwright test e2e/guide.spec.ts --project chromium`；只跑一个项目：`pnpm exec vitest run --project export`。

## Vitest 集成测试的写法

在临时目录写一份文稿，插件用绝对路径列出（编译器接受相对于文稿的路径与绝对路径，也在 `node_modules` 中查找包名），渲染端用 `renderers.<id>.package` 指到包目录，然后用 `@presmium/cli/testing` 的 `presmium(cwd, args, env?)` 真正运行 CLI（包的 `devDependencies` 加 `"@presmium/cli": "workspace:*"`）。它去掉 Vitest 设置的 `NODE_ENV=test`，构建与作者的一样；结果为 `{ code, stdout, stderr }`，不论退出码：

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

it('writes the poll as a list in the notebook', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-poll-'))
  writeFileSync(join(dir, 'lecture.md'), `---\nplugins:\n  - ${ADDON}\nrenderers:\n  notebook:\n    package: ${NOTEBOOK}\n---\n\n## 投票\n\n\`\`\`{poll} 喜欢哪种？\n甲\n乙\n\`\`\`\n`)
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook'])
  expect(code, stdout + stderr).toBe(0)
  const notebook = JSON.parse(readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8'))
  expect(JSON.stringify(notebook.cells)).toContain('甲')
})
```

需要开发服务器时，以子进程运行 `presmium dev`（`PRESMIUM_BIN` 也从 `@presmium/cli/testing` 导出），从输出的 `<渲染端>  <地址>` 一行取地址，结束时按 PID 停止它（范例 `packages/addon-exec-local/test/local-env.test.ts`）。

完整的范例：`packages/addon-exec/test/compile.test.ts`、`packages/cli/test/build.test.ts`（测试用插件在 `packages/cli/test/fixtures/addons/`）。

需要外部条件（Docker、GPU、凭据）的用例在条件不满足时跳过并打印原因与启用方法（`describe.skipIf`、`test.skip`），容器与 compose 项目以工作包编号命名，用工作包自己的端口，结束时只停自己启动的。远端环境的用例用 `templates/env/compose/compose.yaml` 起一台真实的 Jupyter Server（`docker compose -p <项目> up -d --wait`，`JUPYTER_TOKEN`、`JUPYTER_PORT`；范例 `packages/addon-exec-jupyter/test/helpers.ts`、`e2e/fixtures/exec-remote/jupyter.ts`）；不需要 Docker 的凭据用例用记下全部请求的监听器代替环境。

进程沙箱：随 CLI 安装的 `addon-deltabox` 在满足条件的 Linux 主机上默认启用，测试中 `presmium build`、`dev`、`serve` 与 agent-host 运行的 Python 与 JavaScript 代码块都在 deltabox 中运行：构建报告的执行一行多出 `, isolated by deltabox cbcow-through`，代码的父进程是 deltabox 的 worker，`HOME` 与 `TMPDIR` 是会话的临时目录，网络、Unix 套接字与运行目录之外的写入都被拒绝，只读得到系统目录、文稿目录与执行器给出的路径。用例要检查执行代码的进程本身（父进程、`HOME`、能否联网、能否读文稿目录之外的文件）时，在测试工作区的 `presmium.workspace.yaml` 中写 `settings: { presmium.deltabox: { sandbox: false } }`。deltabox 的状态默认在 `~/.local/state/presmium/deltabox`，用例可以用 `XDG_STATE_HOME` 指到临时目录；这个目录要在 `presmium` 进程结束之后再删（它退出前等辅助进程停止会话）。deltabox 自己的用例（`packages/addon-deltabox/test/`）在主机不满足条件时跳过，判断用插件同样的探测（`helpers.ts` 的 `qualification()`）。

服务端的用例（`packages/server/test/`）：`presmium dev` 打印 `server  <地址>` 一行，`/__presmium/<插件 ID>/` 也可以经渲染端开发服务器的地址访问；要设置 `Host` 等浏览器不让 `fetch` 设置的请求头时用 `node:http`（`packages/server/test/helpers.ts` 的 `raw`、`eventStream`）。`serve` 模式（登录、角色、所有者控制台）由测试用的宿主 `packages/server/test/fixtures/serve-host.ts` 以子进程启动（Node 直接运行 TS），环境变量给出工作区、角色与 SHARED 模式的设置；子进程的环境要去掉开发者机器上像凭据的变量，否则 SHARED 模式拒绝启动。需要自己的工作区根目录（`presmium.workspace.yaml`）的文稿放在 `examples/demo/.presmium/` 中并 `git init`，否则工作区根目录是整个仓库。

MCP 的用例（`packages/mcp/test/`、`e2e/mcp.spec.ts`）：`packages/mcp/test/client.ts` 的 `connectMcp(url, token)` 是 MCP SDK 的客户端（以 `versionNegotiation: { mode: 'auto' }` 连接，订阅 `presmium://position` 要用 2026-07-28 的协议），`resultOf` 取工具结果中的 JSON，`controlWindow(server, id)` 是控制通道的一个窗口（报告位置、回答确认），端到端用例按相对路径引用它。`presmium dev` 的每进程令牌与 `/mcp` 的地址在 `<文稿>/.presmium/server.json`；只要服务端时用 `presmium dev --to notebook`，不启动 VitePress。`mcp` 与 `server` 的测试都按路径运行 CLI 的可执行文件，不把 `@presmium/cli` 列为开发依赖（`cli → server → mcp`，互相依赖时 pnpm 的符号链接成环）。SHARED 模式中经 gateway 访问 `/mcp`、插件代理到 gateway 的用例（`packages/server/test/shared-gateway.test.ts`）先取一个空闲端口作 gateway 的地址（`helpers.ts` 的 `freePort`），以它启动 serve 宿主，再以 `presmium gateway --serve <serve 的地址> --port <该端口>` 启动真实的 gateway；`sharedEnv`、`as`（经登录代理的请求头）也在 `helpers.ts`。`presmium-mcp` 加载“随 CLI 安装的包”的用例在文稿目录的 `node_modules/@presmium/cli` 放一个替身 CLI（`packages/mcp/test/fixtures/bundled` 是其中的 `addon-deltabox` 替身）。

语音的用例（`packages/addon-speech/test/`）：假引擎 `presmium-speech fake --port 0` 是自己的进程（`helpers.ts` 的 `startFake()`），打印 `fake  <地址>`，测试以 `PRESMIUM_SPEECH_FAKE_URL=<地址>`、`PRESMIUM_SPEECH_FAKE_PROVIDER` 与可选的 `_KEY` 把它定义为引擎 `fake`（同真实引擎的配置路径）；它的 `GET /requests` 列出收到的请求（方法、路径、`Authorization`），用例按前后的条数验证缓存命中不发请求、凭据只到引擎。音色有 `alpha`、`beta` 与克隆音色 `cloned-lin`；合成的 WAV 在 `pmfk` 块中带文字与音色，转写原样读回。经 `presmium dev --to notebook` 的 `/__presmium/presmium.speech/v1/…` 调用语音（浏览器端 `SPEECH` 的路径）；克隆音色的用例以 `PRESMIUM_OPERATOR_DIR` 把运营者目录放到工作区之外的临时目录，改 `presmium.workspace.yaml` 后要重启 `presmium dev`（设置只在启动时读取）。Node 端 `SPEECH` 由测试插件 `test/fixtures/speech-probe` 的路由（`/__presmium/fixture.speechProbe/engines`、`synthesize`、`transcribe`，`helpers.ts` 的 `probeUrl()`）从服务端的 Node 服务中取用，LOCAL 列在测试文稿的 `plugins` 中（`testDeck(…, [PROBE])`）；要让引擎的某个回答失败时，用 `front(fake)` 在假引擎之前加一层（`failVoices` 次音色列表答 503），把 `PRESMIUM_SPEECH_FAKE_URL` 指向它。SHARED 的用例（`gateway.test.ts`）在 `examples/demo/.presmium/` 中建工作区，把语音插件与测试插件链接进它的 `node_modules` 并列在 `settings.presmium.workspace.plugins` 中（SHARED 只加载列出的包），gateway 的环境中才有语音变量；serve 的 `v1/` 与 Node 端一样经文稿的合成缓存（`talk/.presmium/speech/`）。真实引擎的冒烟用例只在有 `PRESMIUM_TEST_VOLCENGINE_KEY`、`PRESMIUM_TEST_GROQ_KEY` 时运行。

讲授合成的用例（`packages/addon-lecture/test/script.test.ts`、`video.test.ts`，WP-83）同样自己起 `presmium-speech fake`（按路径运行 `packages/addon-speech/bin/presmium-speech.mjs`，测试不引用另一个包的代码），测试文稿的 `plugins` 按路径列出讲授与语音两个插件，并写 `renderers.lecture.voice: { engine: fake, voice: alpha }`；运行 `presmium` 时去掉环境中全部 `PRESMIUM_` 变量再只给假引擎的两个，“没有引擎”的用例就是不给它们。假引擎的逐字时间是确定的（中文每字 220 毫秒、字间 80 毫秒），用例据此写出讲授轨的确切时刻。要构建网页形态的文稿放在 `examples/demo/.presmium/` 中（VitePress 在那里解析），只构建 `lecture` 的放在系统临时目录。agent 工具经 `presmium dev` 的 `/mcp`（令牌在文稿的 `.presmium/server.json`）以 `@modelcontextprotocol/client` 调用。`presmium-lecture export` 用 Playwright 的 Chromium，结果以 Mediabunny 在 Node 中读回（轨道、编码、时长与标签，不解码）。端到端的 `e2e/lecture-script.spec.ts` 中录制的 Ogg/Opus 假引擎读不回（它只认自己的 WAV），所以用例在假引擎之前加一层，按顺序以固定的转写回答对录音的转写请求，其余请求原样转给假引擎。同样的一层也用来模拟别的引擎（`script.test.ts`）：去掉合成回答中的逐字时间（OpenAI 形态的引擎不给），或拒绝转写，以测转写对齐与按字数估算。`presmium serve` 只加载运营者列在 `settings.presmium.workspace.plugins` 中、装在工作区根目录的插件（文稿 `plugins` 中别的包不加载），所以工作区用例要把讲授、语音插件也列进去并链接到根目录的 `node_modules`。读者经 `tracks/script` 的用例（`reader.test.ts`）是本机上的 SHARED 部署（agent-host、带假引擎的 gateway、带登录代理密钥与 `PRESMIUM_CONSOLE_HOST` 的 serve），请求自己写 `Host`、`X-Presmium-Proxy-Secret` 与 `X-Forwarded-Email`。转写回写的端到端用例（`e2e/lecture-writeback.spec.ts`，WP-84）用讲授插件自己的测试 agent `packages/addon-lecture/test/fixtures/writeback-agent.mjs`（ACP over stdio，作为替换的运行时）：它像模型一样按请求经 MCP 调用 `track_narration` 或 `track_translations`，把草稿去掉口头禅后写到讲解的位置，或把译文写进讲授轨中每句的那一行；`WRITEBACK_AGENT_LOG` 记下它看到的提示与工具结果。
助手的用例（`packages/addon-assistant/test/`、`e2e/assistant.spec.ts`）：不 mock agent，用两种真实的对手。确定性的测试 agent `test/fixtures/scripted-agent.mjs` 是 ACP over stdio 的子进程，作为替换的运行时启动（`PRESMIUM_AGENT_COMMAND`、`PRESMIUM_AGENT_TUTOR_COMMAND` 加 `PRESMIUM_AGENT_PROVIDER`，`helpers.ts` 的 `AGENT_COMMAND`），按问题中的指令行事（默认读 MCP 后带引用回答，`#cite <章节>`、`#write <文件>`、`#wait`），`SCRIPTED_AGENT_LOG` 给出它看到的环境与参数。随包的 DeepSeek Harness 则对着测试起的 Messages 兼容服务（`test/fixtures/fake-model.ts` 的 `fakeModel([...])`，按脚本给出文字或工具调用，`hold()` 暂缓回答以便读 agent 进程的 `/proc/<pid>/environ`）运行，经 `PRESMIUM_MODEL_URL`、`_KEY`、`_PROVIDER`（SHARED 中只在 gateway 的环境中）；只有假 `DEEPSEEK_API_KEY` 时以 `HTTPS_PROXY` 指向 `recordingProxy()` 确认没有请求发出。`XDG_STATE_HOME` 指到临时目录（DeepSeek Harness 的 `DSH_HOME` 与 deltabox 的状态都在它下面）。不经页面开会话或签发 MCP 令牌用测试插件 `test/fixtures/runtime-plugin/`（`open`、`close`、`token` 路由）。SHARED 的用例同 `server` 的：先取 gateway 与 serve 的空闲端口，按 agent-host、serve、gateway 的顺序启动。

修改任务的端到端用例（`e2e/assistant-edit.spec.ts`）在 `examples/demo/.presmium/` 中按 `e2e/fixtures/assistant-edit/` 建工作区（助手链接进根目录的 `node_modules`，新文档的模板列出助手），各自 `git init`，以 `presmium serve --port <本组端口>` 运行（LOCAL，唯一的成员是所有者）。测试 agent 在修改任务中按请求改文件，每次写入是一个工具调用（`edit`），写工作目录之外先发权限请求：`presmium-annotations:` 中的每条批注把块的行改为要求；`#append <路径> <文字>`（每行一条）追加；“新增一节”在上下文章节所在一章的末尾加一节；上下文只有文档时（起草）重写 `lecture.md`；`track: <ID>` 把讲授轨的语音段写进第一节。不经浏览器的用例直接调用助手的路由（请求头 `Presmium-Document`，事件流用 `?document=`），审阅以 `tasks/<id>/review` 回答，所有者的确认经控制通道（`/__presmium/presmium.server/control` 的 SSE 与 `{ type: 'answer' }`）。git 审阅的用例在工作区配置中写 `presmium.deltabox: { review: false }`；deltabox 的用例按 `packages/addon-deltabox/test/helpers.ts` 的 `qualification()` 在主机不满足条件时跳过。随包的 DeepSeek Harness 的用例（`serve(…, 'bundled')`，不设替换的运行时）以 `fakeModel([...])` 的脚本给出工具调用（`write`、`read`，路径相对于工作目录），脚本按请求的顺序跨任务连续消费；它在默认设置下总用 git 审阅。首页的起草在工作区把助手加到首页之前（首页的 `info` 不可用时），以 `page.route` 在工作区浏览器插件的模块后追加 `export { assistantPlugin as presmiumAssistant } from '/@fs/<助手>/src/client/plugin.ts'`，并把首页的 `info` 请求改到一份文档。

工作区的端到端用例（`e2e/workspace.spec.ts`）是真实的 SHARED 部署（serve、gateway、agent-host 与每个成员一个测试登录代理），浏览器经 `--host-resolver-rules` 把 `site.test` 解析到本机；测试进程（Node）中 `site.test` 不能解析，要从测试进程取页面的资源时改用登录代理的 `127.0.0.1` 地址。还没有实现的浏览器端服务（如 WP-80 之前的 `AGENT`）可以用替身：`page.route` 拦截工作区浏览器插件的模块（`**/packages/workspace/src/client/plugin.ts*`），在原样的响应后追加一个导出的插件定义，由它 `provides` 并 `ctx.provide` 该服务（令牌按 ID 比较），替身的实现用 `page.addInitScript` 放在 `window` 上，由测试经 `page.evaluate` 驱动；跨页面跳转后仍要记录的结果用 `page.exposeFunction`。

## 端到端测试

`playwright.config.ts`：

- 项目 `chromium` 运行全部用例（除性能用例）；`PRESMIUM_E2E_BROWSERS`（默认 `firefox,webkit`）列出的浏览器只运行 `e2e/smoke.spec.ts`。没有安装或在本机无法启动的浏览器被跳过，配置文件打印原因与安装命令；浏览器用 `pnpm exec playwright install firefox webkit` 安装，WebKit 缺系统库时在 Playwright 的 Docker 镜像中运行（`docs/browsers.md`）。
- 项目 `perf`（`e2e/perf.spec.ts`）依赖 `chromium`，在全部 Chromium 用例之后运行。单独运行它要加 `--no-deps`：`pnpm exec playwright test e2e/perf.spec.ts --no-deps`，否则先跑全部 Chromium 用例。
- 示例文稿的产物 `examples/demo/dist` 是一个站点（同时构建两种形态的默认 `base`：网页在 `/web/`，幻灯片在 `/slides/`），由 sirv 服务（`--single slides/index.html`，幻灯片的页地址回落到幻灯片首页）在 `PRESMIUM_E2E_SLIDES_PORT`（默认 4173）与 `PRESMIUM_E2E_WEB_PORT`（默认 4174）；`e2e/urls.ts` 的 `SLIDES`、`WEB` 是两种形态的地址。`reuseExistingServer: false`：端口被占用时报错，不复用别处的服务，免得测到另一个检出的产物。并行工作时每个检出用自己的一对端口。
- 幻灯片地址 `/<页号>?clicks=<步骤>`，演讲者视图 `/presenter/<页号>`；网页用 `?section=<章节 ID>&step=<n>&view=<视图>` 定位。
- WebGPU：默认的无头 Chromium 有 `navigator.gpu` 而没有适配器（验证回退）；`test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] } })` 得到 SwiftShader（回退适配器，有 `timestamp-query`）。`test.use` 的 `launchOptions` 也是 `playwright.chromium.launch()` 的默认值，要默认参数的浏览器时写 `launch({ args: [] })`（范例 `e2e/exec-webgpu.spec.ts`）。不在示例文稿依赖中的插件包用 `useFixture` 的 `link` 链接进测试文稿。

### 测试文稿

`e2e/fixtures/<组>/lecture.md`（加上它 `{include}` 的文件）。`e2e/fixtures/deck.ts` 提供：

| 名称 | 作用 |
|---|---|
| `useFixture(name, options?)` | 在 `beforeAll` 中构建并服务 `e2e/fixtures/<name>`，`afterAll` 中关闭并删除；返回取得 `FixtureDeck` 的函数。配合 `test.describe.configure({ mode: 'default' })`，文稿只构建一次 |
| `buildFixture(name, options?)` | 同上，手动调用：把文稿复制到 `examples/demo/.presmium/e2e-<name>-XXXX`（插件、Slidev、VitePress 从示例文稿的依赖中解析；目录不入库），写入它自己的 `package.json`（独立的 Vite 缓存），运行 `presmium build --to <to ?? 'web,slides'>`，在空闲端口上服务产物：两种形态的 `base` 都不是 `/` 时（同时构建的默认 `/web/`、`/slides/`）把 `dist/` 作为一个站点服务，否则分别服务 `dist/web` 与 `dist/slides` |
| `FixtureOptions` | `with`（另外复制的 `e2e/fixtures` 下的路径）、`edit(dir)`（构建前修改副本）、`to`（渲染端） |
| `FixtureDeck` | `dir`、`web`、`slides`（地址）、`slide(id)`（章节 ID → 页号）、`close()` |
| `serve(dir, single?)`、`presmium(args, cwd)` | 服务目录（`single` 为 `'/slides/'` 时该路径下不存在的地址回落到 `slides/index.html`：同时构建两种形态的 `dist/` 用 `serve(join(dir, 'dist'), '/slides/')`）、运行 CLI |
| `deckDir`、`startDev`、`openSlide`，`buildFixture` 的 `link` 与 `bases` 选项 | 测试文稿的目录、启动 `presmium dev` 并等待地址、按章节 ID 与标题打开幻灯片等共用的辅助 |

```ts
import { expect, test } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('poll')

test('a vote shows in both forms', async ({ page }) => {
  await page.goto(`${deck().web}/?section=poll&view=present`)
  // ...
  await page.goto(`${deck().slides}/${deck().slide('poll')}?clicks=0`)
})
```

其他组的辅助：`e2e/fixtures/plugins/decks.ts`（`startClassroomServer(deck?)` 在空闲端口启动真实的课堂服务，`writeDeck`、`build`）、`e2e/fixtures/exec/deck.ts`、`e2e/fixtures/core/deck.ts`、`e2e/fixtures/web/deck.ts`。

## 注意

- 端到端用例测的是构建产物：改了源码要先重新构建（`pnpm demo:build`，或由 `useFixture` 构建）。手工起的静态服务器在重新构建后要重启，sirv 启动时就缓存了文件列表。
- 不复用别人起的 e2e 服务器，也不要停掉它们；只停自己按 PID 记下的进程。
- 浏览器语言与界面语言：英文界面的用例用 `lang: en-US` 的测试文稿（如 `e2e/fixtures/core/deck`、`e2e/fixtures/viewer/en`）。
