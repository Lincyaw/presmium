# 音频 MCP 公共部署只读验收（2026-10-27）

公共 4320 已部署 core `463470924be61c197e852fe5e34efa06e46e0a1c`。本次最小只读消费者 14/14，窄屏正文可见性补充 4/4；没有向作者文稿写入，没有导入、录音、转写、合成或模型调用。11 份 canonical JSON 的 SHA 保持一致。私有端到端成功与旧失败继续见 [音频 MCP 验证记录](audio-mcp-authoring-2026-10-27.md)，没有重跑那份完整主链。

## 部署与来源

`live-audio-mcp-deployment.json` 记录固定提交的标准客户端构建、183 个输入、BUNDLE／META 和 11 份文稿字节不变。首次部署因旧 supervisor PID 已不存在而拒绝，保留 `live-audio-mcp-deployment-stale-supervisor.json`；确认 4320／17407 均无 listener 后才受控恢复启动，不是因一次观察超时盲重启。

执行前重新读取私有记录与源码：37/37 的 14 项源 SHA、Doc 3/3 的 12 项源 SHA 均仍匹配，公开 root 8/8 的 7 项源 SHA 也匹配。原 bench 末段 root8 补充已经存在。部署后的主目录 14 项源 SHA 又与私有最终记录逐项一致，并在本次公共消费者前后保持不变。

消费者只从主目录源码与主依赖解析公开 MCP SDK、Playwright；没有从隔离 worktree 的新媒体 WIP 构建客户端。它读取当前受控 session 与 MCP state file，凭据只驻留进程内存，日志不输出 token 或完整授权 URL。新消费者、JSON 与截图权限为 0600，所有旧证据文件均保留。

## 真实运行结果

`.presmium/ui-evidence/live-audio-mcp-readonly-browser-46347092.json` complete=true，14/14：

| 范围 | 实际结果 |
| --- | --- |
| 冻结来源 | 主目录 14 项 source SHA 与私有验收一致，前后不变 |
| MCP 清单 | 真实已部署服务提供音频能力、原文件预检、canonical 音频检查和导入 4 个工具；本次只调用读工具 |
| 有服务的文稿 | `guide-authoring` 声明 addon-lecture，能力 available，绑定实际已保存 UUID／version／fingerprint，verification 为 configuration-only |
| 无服务的文稿 | `guide-content` 只声明 addon-content，能力 unavailable／audio-unavailable，3 个音频动作均为 false |
| 原文件能力拒绝 | 对 `guide-content/media/tone.ogg` 的真实预检返回 503；MCP 公开包装为 code=tool-failed，message=production-audio-unavailable，没有伪造检查结果 |
| 同文稿边界 | 从 guide-authoring 检查 guide-content 原音返回 403 |
| 普通 Doc | guide-authoring 的 7 页全部保留，只有一个可编辑 BN，未进入 Video；没有 IR、IR events、preview 或 voice-catalog 请求，诊断快照 version 0→0 |
| 资源与副作用 | pageerror／浏览器 HTTP failure／写入／提供方请求／外网请求均为 0，11 份作者 JSON 不变，自己的 MCP client 与浏览器已关闭，公共服务保留 |

这 11 份公共文稿没有 canonical audio 资产。唯一可见普通原音在未启用 lecture 服务的 guide-content，因此本次没有公共正向媒体检查成功声明。不能为了验收改作者插件声明、跨文稿借服务或导入新资产。真实成功的预检、导入、inspection、SHA／时长和事务回滚已由私有 37/37 证明。

## 四种外观与窄屏补充

通过实际“设置”对话框选择亮／暗主题，桌面 1440、窄视口 390 均保留完整原生文稿，没有 Video 的录音／转写控件，也没有 source 容器横向溢出。这只是窄视口外观，未开启或验收 coarse pointer／触控。

四张原图均已实际查看。桌面图正文正常；初次直接从桌面 resize 到 390 时保留了打开的导航 drawer，原窄图只证明该导航状态，不能作为窄屏正文可见的证明。

独立 `.presmium/ui-evidence/live-audio-mcp-narrow-document-46347092.json` 4/4 使用真实“导航窗格”按钮关闭 drawer 后分别截图。两种主题的 `elementFromPoint` 都命中 native editor，不被导航覆盖，source 宽与 scrollWidth 都为 390，11 份 JSON 仍不变，0 error／HTTP／写入／提供方请求。两张补图也已实际查看。

最终四种正文外观依据：

- `live-audio-mcp-readonly-browser-46347092-light-1440.png`
- `live-audio-mcp-readonly-browser-46347092-dark-1440.png`
- `live-audio-mcp-narrow-document-46347092-light-390.png`
- `live-audio-mcp-narrow-document-46347092-dark-390.png`

## 保留的消费者失败

没有覆盖或将以下记录算作成功：

- `live-audio-mcp-readonly-46347092.json`：第 3 项错误假定 guide-content 有音频服务，实际 unavailable；文稿字节未变。
- `live-audio-mcp-readonly-final-46347092.json`：第 5 项错误把领域 message 当成 MCP 的 5xx code；实际是 tool-failed／production-audio-unavailable／503，原记录保留。
- `live-audio-mcp-readonly-complete-46347092.json`：前 6 个后端断言通过，浏览器启动前因消费者 CJS 导入方式失败。改用主依赖公开 require 入口后才执行最终 14 项；不是产品浏览器错误。

上述失败均在浏览器启动前停止，自己的 MCP client 已关闭，没有 JSON 写入、提供方调用或公共服务重启。

## 未声明通过的能力

没有调用 ASR／TTS，不代表真实转写、字幕采用、人声转 TTS、取消付费请求、真人设备、播放或导出通过。没有重跑 clipboard／页面变更／全部矩阵／测试套件。Doc 版本与纯源路由的故障 pass 因果仍以私有独立 3/3 为准；本次公共检查不以没有 IR 请求单独推断所有后端代码绝未执行。
