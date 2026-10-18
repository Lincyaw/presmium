# 示例工作区

两份文档组成的工作区，用来体验 `presmium serve`（文档列表与产物）和 `presmium studio`（工作台：编辑与 agent）：

- `bpe/`：示例讲义“BPE 分词”（`../demo` 的副本，头部另外列出读者问答插件）；
- `glance/`：一份短文档“分词速览”，三小节和一道测验，适合拿来试修改。

`presmium.workspace.yaml` 写明站点的标题与页脚，以及运营者插件（语音与读者问答，每份文档都加载）。文档列出的插件从本目录的 `node_modules` 加载（见 `package.json`）。

## 本机启动

工作区要是一个 git 仓库的根目录：插件从那里加载，文档操作与接受的修改都提交到那个仓库。本目录在 Presmium 仓库之中，所以先用 `try.mjs` 把它复制成一个独立的仓库。在 Presmium 仓库的根目录运行：

```sh
pnpm install
pnpm add -g ./packages/presmium ./packages/studio  # 全局命令 presmium 与 presmium-studio，运行这份源码
node examples/workspace/try.mjs ~/presmium-example-workspace
presmium serve ~/presmium-example-workspace         # 文档列表与产物：http://127.0.0.1:4310
presmium-studio ~/presmium-example-workspace        # 工作台：只打印一个网址
```

副本中还有 BPE 讲义引用的示例代码 `examples/sample-repo` 与讲义锁定的几个提交，所以代码引用和它们的永久链接照常可用；`node_modules` 是指向本目录 `node_modules` 的链接。

## 模型与语音

凭据只放在启动命令的终端的环境变量中，或工作台的模型设置中，不写进仓库与工作区：

| 变量 | 作用 |
|---|---|
| `DEEPSEEK_API_KEY` | 工作台中的 agent 访问 DeepSeek |
| `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` | 改用自己的 Messages 兼容服务（三个都要设置，优先于 `DEEPSEEK_API_KEY`） |
| `PRESMIUM_SPEECH_VOLCENGINE_KEY` | 火山引擎的语音：由讲解合成讲授（文档头部要选音色，见 `../demo/README.md`）、转写录制的讲授 |

读者的“提问”不用这里的任何设置：读者在“提问”面板中填写自己的 OpenAI 兼容服务（只保存在他的浏览器中），问题直接发给这个服务。

## 连接外部 agent

Claude Code、Codex 等外部 agent 经 MCP 读讲义、运行代码、跳转放映。`presmium serve` 启动时打印 MCP 的地址与令牌所在的文件（只有你能读，在工作区之外），以 `Authorization: Bearer <token>` 连接，例如：

```sh
claude mcp add --transport http presmium http://127.0.0.1:4310/mcp --header "Authorization: Bearer <token>"
```

运行代码、跳转放映与开关课堂要在页面中允许（工作区配置的 `approvals` 可以改为 `allow`）。

## 与示例讲义保持一致

`bpe/` 由 `sync.mjs` 从 `../demo` 复制（讲义源码、执行录制与锚点锁定，头部多一行读者问答插件）：

```sh
node examples/workspace/sync.mjs          # 更新 bpe/
node examples/workspace/sync.mjs --check  # 只检查，不一致时列出文件并以 1 退出
```
