# 示例工作区

用来体验工作区服务 `presmium serve`：文档管理、编辑模式、批注与对话（配置模型后）、修改审阅与修改历史。工作区有两份文档：

- `bpe/`：示例讲义“BPE 分词”（`../demo` 的副本，头部另外列出了助手插件，编辑模式因此有“AI 修改”）；
- `glance/`：一份短文档“分词速览”，三小节和一道测验，适合拿来试修改。

`presmium.workspace.yaml` 写明站点的标题与页脚，以及运营者插件（语音与助手，每份文档与首页都加载）。文档列出的插件与 `presmium dev` 一样，从本目录的 `node_modules` 加载（见 `package.json`）。

## 本机启动

工作区要是一个 git 仓库的根目录：插件从那里加载，新建、重命名文档与接受的修改都提交到那个仓库。本目录在 Presmium 仓库之中，所以先用 `try.mjs` 把它复制成一个独立的仓库，再启动服务。在 Presmium 仓库的根目录运行：

```sh
pnpm install                                                  # 安装插件
node examples/workspace/try.mjs ~/presmium-example-workspace   # 复制成独立的 git 仓库
node packages/cli/bin/presmium.mjs serve ~/presmium-example-workspace
```

启动时终端打印服务的地址、工作区，以及外部 agent 连接用的 MCP 地址和令牌所在的文件（见下文“连接外部 agent”）；助手（运营者插件）另打印一行状态：可用时写模型的服务提供方、运行时与设置的来源，不可用时写缺少的设置。

打开 <http://127.0.0.1:4310>，首页列出两份文档。服务只监听本机，你就是工作区的所有者，不需要登录。副本中还有 BPE 讲义引用的示例代码 `examples/sample-repo`，以及讲义锁定的几个提交，所以代码引用和它们的永久链接照常可用；`node_modules` 是指向本目录 `node_modules` 的链接。

直接 `node packages/cli/bin/presmium.mjs serve examples/workspace` 也能启动，两份文档照常显示，但这时 git 仓库是 Presmium 仓库：文档管理、接受的修改与撤销都会提交到 Presmium 仓库。所以请用副本。

## 环境变量

模型与语音的凭据只放在启动 `presmium serve` 的终端的环境变量中，不写进仓库，也不写进工作区的任何文件。模型也可以在页面中填写：首页或文档工具栏的“AI 修改”中打开“模型设置”，填写服务（DeepSeek 的官方地址，或 Messages 兼容服务的地址与服务提供方的名字）、密钥与模型名。设置保存在用户配置目录的 `presmium/assistant.json` 中（只有你能读，不在工作区里），保存后下一次 AI 修改即用，不必重启；页面只显示密钥是否已设置，不回显它。换了服务或地址时要重新填写密钥，已存的密钥不会发往另一个服务。环境变量优先于页面的设置，面板写明当前用的是哪一个：

| 变量 | 作用 |
|---|---|
| `DEEPSEEK_API_KEY` | 编辑模式的“AI 修改”（批注、对话）、新建文档时“由 agent 起草”：随 Presmium 安装的 DeepSeek Harness 用它访问 DeepSeek。讲义中的“提问”不用它：读者在“提问”面板中填写自己的模型服务（OpenAI 兼容的地址、密钥与模型名，只保存在他的浏览器中） |
| `PRESMIUM_MODEL_URL`、`PRESMIUM_MODEL_KEY`、`PRESMIUM_MODEL_PROVIDER` | 改用自己的 Messages 兼容服务（三个都要设置，优先于 `DEEPSEEK_API_KEY`） |
| `PRESMIUM_SPEECH_VOLCENGINE_KEY` | 火山引擎的语音：由讲解合成讲授（文档头部要选音色，见 `../demo/README.md`）、转写录制的讲授 |

```sh
export DEEPSEEK_API_KEY=<你的密钥>
node packages/cli/bin/presmium.mjs serve ~/presmium-example-workspace
```

没有设置模型时，其他功能照常可用，“AI 修改”面板说明没有配置模型、可以在“模型设置”中填写或设置哪些环境变量，启动日志也写明缺少哪项设置。

读者的“提问”不用这里的任何设置：提问在浏览器中完成，读者在“提问”面板中填写自己的 OpenAI 兼容服务（地址、密钥与模型名，只保存在这个浏览器中，面板提示同一站点的脚本能读到密钥），问题与当前章节的文字直接发给这个服务，不经 `presmium serve`。为学生构建的静态站点（`presmium build --audience student`）同样能提问。

## 连接外部 agent

Claude Code、Codex 等外部 agent 经 MCP 读讲义、运行代码、跳转放映。`presmium serve` 启动时打印：

```
mcp  http://127.0.0.1:4310/mcp (its token is in /home/<你>/.cache/presmium/serve/<工作区的哈希>/server.json)
```

这个文件（只有你能读，在工作区之外）的 `token` 是本次进程的令牌，以 `Authorization: Bearer <token>` 发送；进程重启后令牌随之更换。例如 Claude Code：

```sh
claude mcp add --transport http presmium http://127.0.0.1:4310/mcp --header "Authorization: Bearer <token>"
```

运行代码、跳转放映与开关课堂要在页面中允许（工作区配置的 `approvals` 可以改为 `allow`）。

## 体验步骤

1. **文档管理**：首页的“管理文档”可以新建文档（从模板）、复制、重命名、删除。试着把 `bpe` 重命名为 `bpe-intro`：“分词速览”中指向它的链接随之改写。每个操作是一个提交，“修改历史”列出它们，每一项都可以撤销。
2. **编辑模式**：打开“分词速览”，点工具栏的“编辑”。
3. **批注**：点“AI 修改”，在页面上点选“词元是什么”一节的第一段，写下要求（例如“改得更口语一些，加一个中文的例子”），点“添加批注”，再点“发送 1 条批注”。面板写明模型的服务提供方，agent 的修改马上出现在页面上。
4. **对话**：在同一个面板中写一句要求（例如“在文末新增一节：为什么词表不能无限大”）并发送，当前的章节与选中的文字会一起带上。
5. **审阅**：agent 结束后，面板逐个文件列出改动的差异。可以“全部接受”，取消勾选某些文件后“接受其余”，或“全部拒绝”；展开各步，还可以“回到这一步之前”。
6. **撤销**：接受的改动成为一个提交，面板中的“撤销这次修改”或首页的“修改历史”都能撤销它。
7. **BPE 讲义**：打开“延伸”一章，运行 C 程序与 GPU 着色器，先运行“先训练”再运行“再编码”体会会话，写下预测再看答案；“视图”菜单中的“放映”逐步放映，放映视图中可以录制讲授（需要麦克风）。
8. **提问**：在 BPE 讲义的工具栏点“提问”，填写你自己的模型服务（OpenAI 兼容的地址、密钥与模型名），选中一段代码提问；回答边生成边显示，其中的章节可以点击跳转。

## 与示例讲义保持一致

`bpe/` 由 `sync.mjs` 从 `../demo` 复制（讲义源码、执行录制与锚点锁定，头部多一行助手插件）。改了示例讲义之后运行：

```sh
node examples/workspace/sync.mjs          # 更新 bpe/
node examples/workspace/sync.mjs --check  # 只检查，不一致时列出文件并以 1 退出
```

端到端用例 `e2e/demo-workspace.spec.ts` 检查两者一致，并在一个 `try.mjs` 做出的副本上启动 `presmium serve`。
