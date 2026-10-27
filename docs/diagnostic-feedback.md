# MCP 诊断读取与显式检查

`get_diagnostics` 读取工作台正在使用的 `DiagnosticSnapshot`，不编译、不运行插件检查。`check_document` 才显式运行编译与检查，再返回计数和后续读取依据。工具契约以 `packages/mcp/src/diagnostics.ts` 为准。

诊断是生产者已经报告的观察，可能属于旧修订。每条记录保留 ID、文稿、origin、源位置和已有 revision；读取不会将检查、浏览器、请求或其它来源合并为一个成功标记。空快照不证明当前源有效，也不证明浏览器正确显示。

## 读取完整快照

调用 `get_diagnostics({ document?, version?, digest?, offset? })`。多文稿指定目录；文稿绑定令牌不能指定另一份文稿，空字符串仍表示根文稿。

- 小快照返回 `encoding: 'value'`，`value` 是完整 `{ version, diagnostics }`。
- 大快照返回 `encoding: 'json-text-fragment'`、`text`、`offset`、`nextOffset`、`totalChars` 和 `complete`。按返回偏移拼接解码后的 text，全部取得后再 `JSON.parse` 一次。
- 每次继续读取携带首读的 version 和 digest。digest 是 `JSON.stringify(snapshot)` 的 FNV-1a 64；同时核对它可避免服务重启后的同号版本混合。改变后返回 409，调用方从首读重新开始。
- 偏移按 UTF-16 字符计，合法代理对不拆开；偏移越界或落在代理对中间返回 400。没有版本和摘要的非零偏移也返回 400。

有效请求最多 2048 个 `JSON.stringify` UTF-16 字符，目录最多 200 个字符；handler 回复最多 7168 个缩进 JSON UTF-16 字符，包含转义、元数据和正文。SDK 的输入 Schema 拒绝仍使用框架错误格式，不属于 handler 的结构化错误。没有快照生产者且尚无实际观察时返回 `available: false`，不返回虚构的空白健康状态。

`verification: 'unobserved'` 表示此次读取没有验证当前源或浏览器。它不否认记录中的错误已经被观察到。

## 显式检查

`check_document({ document? })` 调用已有宿主 check，返回实际结果数量、错误／警告／信息计数、快照 version／digest 和 `next: 'get_diagnostics'`。检查执行项目插件代码，可能耗时；读取当前问题时不要调用它。它不触发配音、导出或播放。

工作区与服务器继续由原诊断 owner 发布 check contribution，不创建第二份工作台状态，也不清除其它生产者。compiler-only stdio 没有浏览器生产者，保留最近一次实际编译或显式检查的进程内观察；旧编译资源再次观察到新修订时会替换旧检查观察；被动读取本身不探测磁盘变化。该缓存不是跨进程任务账本或已保存文稿。

检查计数只证明这次调用返回了这些检查结果，尚未建立完整的当前源绑定；结果明确标注 `currentSource: 'unverified'` 和 `browser: 'unobserved'`。浏览器渲染、播放及导出仍各自需要真实验证。

`presmium://diagnostics?document=<目录>` 保留完整 SDK 资源。服务器资源读取同一快照，不隐式编译；compiler-only stdio 的旧资源可编译当前文稿，但不运行完整检查。大资源可能超过 agent 上下文预算，正常 agent 读取使用有界工具。

## 未编译的作者窗口

已选文稿的工作台异常和 5xx／网络请求失败通过 `POST diagnostics/authoring` 报告，原生 Doc 无须先准备 IR。报告只含文稿、独立窗口 instance 和至多 20 条错误；不含草稿正文、请求 payload、stack 或 URL 凭据。工作台已有的清除与重试发送动作保持不变。

诊断使用独立 `origin: 'authoring'`。每条错误可带 `authoringSource`，表示请求开始或异常发生时窗口已知的保存基线，不是出错草稿或当前编译修订；未知时省略。接收报告不会验证当前 JSON、编译或建立一个虚构 IR revision。旧源错误仍可读取，并与当前源另行比对。

HTTP 入口保留启动令牌与 editor 角色检查，确认文稿目录存在；正文限制 64 KiB，消息最多 600 字符，字段严格校验。服务按受信 member 和窗口 instance 隔离贡献，空报告只清自己的记录；编译、检查和其它窗口不能清掉该贡献。被拒绝的报告不改变快照。

恢复请求按原请求身份确认，迟到失败不替换较新的成功结果；切换文稿后的旧报告不能修改新文稿的反馈。报告入口不经过自身请求失败观察器，发送失败可明确重试，不递归制造新故障。4xx 继续交给原本的局部操作处理，不因此新增全局错误。

这些是最后收到的观察，不证明窗口仍在线。未关联文稿的全局故障、浏览器崩溃后的客户端生命周期与完整草稿状态仍需客户端登记协议补齐；本入口不读取或恢复浏览器草稿。
