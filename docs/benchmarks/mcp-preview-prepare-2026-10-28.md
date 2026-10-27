# MCP 显式准备预览

2026-10-28，从 `dc6090ec` 的独立工作树实现 `preview.prepare`。它沿现有 authoring-client 通道，在同一个 `Workbench.preparePresentation` owner 中明确编译并准备当前已保存文稿；不创建第二个编译队列、writer 或事件连接。Doc 保持模式和位置，不进入 Video／Present，不合成或播放。

准备的取消信号与请求截止时间进入原 owner。其采用前再次同步检查 source version／fingerprint、IR、项目代次、来源状态、取消和截止时间；人工取消与关闭文稿也中止原 controller。共享 IR 请求已开始的服务端编译可以继续形成缓存，但不能由失效浏览器 owner 采用。`snapshot.preview` 只有实际 prepared 时才返回 canonical source、IR revision 与项目代次。

公开模态语义与原生 beforeinput／compositionstart／Esc 是准备期间的有界保护。已有 source、timing、page 和 history owner 仍负责自己的状态；不读取输入值或选区，不登记全部本地表单，也不声称保存了未提交批注或录音。公共 PmDialog 显式标注 `aria-modal=true`，没有视觉样式改动。MCP 请求仍在原 30 秒过期，人工准备仍保留 45 秒及可见超时错误；同意图重试只读原回执。

## 实际运行

使用私有真实 Studio、两个临时规范文稿、官方 MCP TypeScript SDK 和 Chromium。最终 `run-1793142337223/result.json` **48/48、complete=true**，包括：

- 没有浏览器时没有客户端能力；真实 Chromium 预编辑与已有公共模态框拒绝准备。清洁原生编辑器聚焦仍允许准备，不把焦点当作永久禁用条件。
- SDK 请求先返回 sent，随后收到 browser-acknowledged 的 done；真实后端 IR 响应与 prepared source／revision 一致，规范 JSON 字节未改变。单个原生编辑器、Doc、原位置与无 iframe 均实际核对；相同意图不再请求编译。
- 暂缓真实后端预览响应后，分别以原生 Esc、正文输入、公共 Help Dialog、切文稿及同源刷新断线使原 owner 失效。释放迟响应后没有采用，重连的新 epoch 也不继承旧准备。
- MCP 请求按真实时钟约 30 秒过期，重读旧意图没有重新编译。人工入口真实等待 45,070ms 后显示公共错误条，释放迟响应仍不采用。
- 显式注入一次 HTTP 503，得到 failed／unavailable，继续显示 Doc，没有假准备成功。该项是故障注入，不声称卸载过真实编译模块。

970 个包内源码、样式、包声明与锁文件起止摘要一致，包含全部 7 个改动的运行源；最终源码与摘要一致。页面异常、模型调用及外网请求均为零，HTTP 只有上述预期 503。浏览器、MCP 客户端、服务、临时 home／workspace／fixture 均清理，记录的服务 PID 不存在。类型检查 1274 文件、技能、分层、令牌及 diff 检查通过；未新增 tracked tests，未运行套件、全示例构建或导出，没有操作公共 4320／17407。

## 保留的观察器失败

所有原始结果都保留在忽略目录 `.presmium/preview-prepare/`，未将局部结果改写为完整通过。

| 原始目录 | 结果与修正 |
| --- | --- |
| `run-1793141630568` | 27 项通过后，观察器只读客户端清单第一页，遗漏后续在线客户端；改为按 nextAfter 读取，不加等待或放宽归属条件。该轮尚未覆盖真实请求过期及人工超时。 |
| `run-1793141907506` | 3 项通过；单次 Esc 先关闭顶部 Tooltip，Help Dialog 仍在，后续点击被真实模态框拦住。观察器改用原 Close 按钮明确关闭，保留原分层行为。 |
| `run-1793141951910` | 44 项通过；人工超时错误实际已显示，但观察器查 status，而公共 danger notice 使用 alert。截图与 unavailable 状态保留，只修正角色定位。 |
| `run-1793142137313` | 47/48；about:blank 断线步骤触发 Studio fixture 的 localStorage 初始化在不透明来源上的 SecurityError。无产品页面的独立 Chromium 也重现相同错误，见 `opaque-origin-observation.json`；最终以同源刷新验证旧 WebSocket／epoch 断线，未吞掉异常。 |

最后三轮的 7 个运行源相同，各自保留完整摘要与清理结果。最终结果和具体冻结范围由 `final-manifest.json` 索引。只验证 Chromium 的真实预编辑，不声明系统输入法或其它浏览器已验收。录制、未提交草稿读取／恢复、审阅、打开文稿与全部本地表单登记仍未由本片实现。
