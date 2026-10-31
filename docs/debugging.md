# 调试预览加载与卡顿

同时保留浏览器与服务两侧的证据。后端返回地址不等于预览完成握手，完成握手也不等于内容或播放器可用。

## 1. 看当前服务

- 日志：`pnpm studio` 在终端实时显示工作区服务日志，并打印持久日志路径，默认 `~/.local/state/presmium/studio/presmium-studio-<散列>.log`（跟随 `XDG_STATE_HOME`）。按文稿、预览请求编号（`[preview N]`）或导出任务（`[job]`）查看阶段与耗时。日志含启动网址，不要原样贴进报告。
- 诊断：已连接工作区的 AI 助手读取 `presmium://diagnostics?document=<文稿目录>`；`get_runtime` 取预览窗口的实际反馈，`get_outputs` 看构建结果，`check_document` 显式执行检查。`get_diagnostics` 只分片读取已有快照。没有窗口反馈只说明尚未观察到浏览器，空快照不证明健康。

## 2. 打开时要求 dsh 认证

页面显示 `dsh web authentication required; reopen the URL printed by dsh web.` 时先看主页面的 HTTP 状态：401 是浏览器没有当前地址的登录凭据，403 是 Host 或 Origin 检查拒绝。

- 从正在运行的 `pnpm studio` 终端重新打开完整启动网址，主机名与端口与原先一致；`localhost:4320` 与 `127.0.0.1:4320` 的登录各自独立。
- 启动网址中的令牌只属于本次进程，重启后旧链接不能登录。已建立的 cookie 由状态目录中的持久凭据签名，默认 30 天有效，同一状态目录与地址重启后仍有效。
- 记录状态码与是否进入工作台，不输出令牌或 cookie。协议见 [dsh 认证说明](../vendor/docs/dsh/packages/client/connection/README.md#browser-authentication-and-request-trust)。

## 3. 多标签页请求不返回

记录每个标签页的活动 SSE、HTTP 协议、请求发送与响应头时刻，并用带同一 cookie 的独立 Node 请求对照。不要从 DevTools 的请求创建事件推断请求已到达服务，也不用重发、短超时或关闭其他页面当作修复。

正常 Studio 用共享的事件 WebSocket 推送数据，并关闭 shell 的 `client-hmr`。自有 profile 重新启用 HMR 时，`/plugins/events` 会恢复为每页一条 SSE，且根客户端热替换可能丢失未保存的批注草稿；客户端代码重建或外壳插件启停后应重新加载页面。见 [Studio](studio.md)。

共享检出中日志出现读取 `packages/dsh/build/dist/client.json` 或 `client.js` 的 `EACCES` 时，先查生成产物的权限。确认页面实际加载了新构建，才算修复生效。

## 4. 用隔离副本复现

```sh
pnpm debug:studio .presmium/gallery-workspace --document libraries
pnpm debug:studio .presmium/gallery-workspace --document libraries --views document,present,document --timeout 30000
pnpm debug:studio --help
```

入口复制工作区，在独立的状态目录、端口与 Chromium 中按序打开视图，原工作区与服务不受影响。不给工作区时用 `examples/gallery` 的新副本；给了工作区但没有 `--document` 时打开第一份文稿。

| 参数 | 含义 |
|---|---|
| `--views` | `document`、`present` 的切换顺序，默认 `document,present,document` |
| `--timeout` | 每次切换的等待毫秒数，1000 到 300000，默认 45000 |
| `--headed` | 显示 Chromium 窗口 |
| `--output <新目录>` | 证据目录，默认 `.presmium/debug/<时间>/`，已存在则拒绝 |

观察器在首次导航前安装，采集主页面与 iframe 的未捕获异常、未处理 Promise、控制台 warning 与 error、HTTP 4xx/5xx、网络失败、超过 1 秒的请求、超过 50 ms 的长任务与预览的 ready、activity、report 消息，以及服务启动起的后端日志。每次切换按点击、握手、内容三阶段等待：文档须出现章节，放映须出现 `.pm-slide`。配置了讲授时还会点击播放并验证时间推进（`playbackAdvancedMs`）。

## 5. 读取证据

| 文件 | 内容 |
|---|---|
| `summary.json` | 首次打开耗时，每次切换的阶段与耗时，错误计数，至多 20 条问题，`complete` |
| `events.jsonl` | 按时间与步骤排列的前后端事件，含诊断与导出任务快照；至多 2000 条，超出数记在 `dropped` |
| `backend.log` | 后端日志 |
| `<步骤>.png`、`failure.png`、`final.png` | 失败与结束时的截图 |

超时会先记录待完成请求，再读取 iframe 地址与截图。长连接不算挂起，切换导致的 `ERR_ABORTED` 记为取消。不采集 headers、cookie 与正文，查询参数与启动令牌被移除；截图含真实文稿，交付前核对。任一步骤失败或捕获到浏览器错误时进程以非零状态退出。`complete` 为 true 后仍要看各步骤的 `state`、`browserFailures` 与 `backend.log`。

定位顺序：

1. 同一步骤的 `[preview N]`、`[viewer]`、`[job]` 是否完成；未完成则看后端最后阶段。
2. 后端完成但没有 ready 消息：看失败资源、慢请求与超时时的待完成请求。
3. 握手完成但内容未出现：看组件异常、控制台错误、长任务与播放器状态。
4. 没有异常仍然慢：区分冷启动、首次加载与返回已加载视图，在同一负载下比较修改前后。

## 6. 注意

- 隔离运行成功不证明原标签页已恢复。只在原标签页出现的问题，检查那个标签页的控制台、网络、扩展、缓存与会话。
- 交付新客户端时，验证重新加载后的真实界面，不只看构建成功。
- 升级后用作者正在用的工作区副本复现。旧文稿可能仍引用 `@lincyaw/slidev-addon-*`，编译器与文稿打包器会转换为 `@lincyaw/addon-*`；不要删除作者的副本、改写其源码或把未解析的模块外置来绕过错误。
