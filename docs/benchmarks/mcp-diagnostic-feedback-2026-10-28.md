# MCP 诊断快照与显式检查

2026-10-28，隔离 worktree `mcp-diagnostic-feedback`，基线 `6b8cd29c`。将 `get_diagnostics` 改为读取工作台已有诊断快照，`check_document` 才运行编译及插件检查。诊断保留 origin、文稿、源位置及已有 revision；空记录和检查计数都不表示当前源或浏览器通过验证。接口和限制见[诊断反馈](../diagnostic-feedback.md)。

运行改动限 MCP 的 `diagnostics.ts`、`mcp.ts`、`cli.ts`，server 的 `mcp-host.ts` 及 DSH 的 `node/context.ts`。CLI 明确绑定其唯一文稿 `''`，防止被动读取经文稿发现重新编译。没有新服务、写入、内容格式、模型、计时器或持久结果账本。

## 实际消费者

所有记录在本 worktree 的 ignored `.presmium/ui-evidence/`，没有新增 tracked tests 或运行测试套件。Studio 使用原 `startStudio({ isolateClient:true })`、原客户端构建器、私有 workspace 和动态端口；插件实际写 pass／check marker 并返回长诊断，不 mock MCP 或宿主。

| 记录 | 结果与范围 |
| --- | --- |
| `diagnostic-feedback-before-1793119607804/result.json` | 原版 4/4 诊断断言：冷启动未运行项目 pass/check；读取旧 `get_diagnostics` 实际运行二者，69,539 字符的结果被真实 DSH pruner 截断。这是反例成立，不表示旧产品可用。 |
| `diagnostic-feedback-after-1793119707724/result.json` | 首轮 13/13：被动读取不运行 pass/check，显式检查才运行；35 条含转义和代理对的真实诊断经实际 DSH wrapper/pruner 分片完整重建，16 次读取，最大回复 7168。再次观察不重跑；非法边界和无绑定续读为 400，实际检查变化后旧续读为 409，另一文稿令牌为 403。 |
| 同一首轮 | 实际浏览器打开 Doc，展开看到 18 条 error；Web、SDK resource 和 MCP 重建的完整版本／内容一致。35 条同时包含 17 条 warning，没有仅读取可见 error。规范 JSON 字节未变，无页面异常、失败请求、外网或模型。此轮发生在 CLI 单行修复前，不冒称其 stdio 验证。 |
| `diagnostic-stdio-unbound-1793119987984.json` | 6/6 反事实：原先未绑定身份的真实 compiler host 经正式 stdio transport 运行；改源后被动读取仍触发编译，坏 JSON 还阻止读取已观察结果。没有以假 host 替代该链。 |
| `diagnostic-stdio-cli-1793120056987.json` | 真 CLI 10/10：改源、坏 JSON 后被动读取保留旧观察且 pass 不增；显式检查错误不冒充成功或清旧观察，修复后显式检查更新结果，外文稿为 403。 |
| `diagnostic-feedback-after-1793120411923/result.json` | 最终五运行源的 15/15 观察：重验 HTTP 正常读取与浏览器范围，再用一次受控 HTTP 500 确认下一节的生产者缺口。最后两条断言证明缺口存在，不能宣称全部前端异常已接通。 |

保留两份 401 探针未完成记录 `1793120136054` 和 `1793120242346`：先误等默认折叠的详情文字，后误等全局 Notice；原实现将 4xx 交给本地动作处理，不经过全局 5xx 请求故障路径。改用受控 500 并真实展开详情后才完成生产者诊断，没有为探针改产品。初次仅过滤安装 MCP 依赖导致依赖缺失，另一次遗漏 `relativeToDeck` import 的输出保留在忽略日志中；补全本地缓存依赖、修正 import 后，最终 1246 文件类型、分层、技能与 diff 检查通过。

## 尚未准备 IR 的前端反馈缺口

最终消费者实际编辑正文，一次 `document/change` 被浏览器故障注入返回 500。作者看到未保存和保留草稿的重试入口，展开全局详情可读到真实请求路径与 HTTP 500；规范 JSON 未被写入。但 MCP 诊断快照没有该请求错误。

源码确认 `WorkbenchRuntimeDiagnostics` 只有 `state.ir` 存在时才发送 `PreviewDiagnostics`。普通原生 Doc 不准备 IR，此时无法向该生产者提供编译修订。这是独立的作者诊断契约缺口，此片没有编造 IR、把异常归到其它生产者或宣称修复。后续须用作者源／未知状态表达正文窗口反馈，使失败本身不依赖成功编译。

已实际查看普通诊断和 500 失败两张桌面亮色图；本片没有修改 UI／CSS，也没有据此声明四种界面组合验收。五轮 Studio 的自有 owner／backend／frontend PID 实际退出，两个 stdio 客户端及 pruner fibers 关闭，所有私有 home／workspace／fixture 删除。完整 SHA 与终态汇总在 `.presmium/ui-evidence/mcp-diagnostic-feedback-final-manifest.json`。没有访问公共 4320／17407，没有 ASR、TTS、导出或全量示例构建。
