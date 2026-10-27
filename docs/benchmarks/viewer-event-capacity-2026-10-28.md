# 完整查看器的同源长连接容量

2026-10-28，固定提交 `0be1d6aaa893f8f3f4b968404de23a9b6a9b7617`，独立 worktree `viewer-event-capacity`。这是未修改产品的诊断，不是查看器传输修复；此前正文六 Tab 的共享连接证据不涵盖本边界。

## 实际流程与结论

私有 Studio 使用原版 `startStudio({ isolateClient: true })`，动态端口、同一 Chromium context。小规范文稿只有两页，引用仓库真实 Motion 场景；仅准备该文稿的 web 形态，没有语音、模型、外部素材或全量示例构建。

| 实际操作 | 观察 |
| --- | --- |
| A 进入放映，显示 Motion 六个柱形 | 后端同源有两条 SSE：`/__app/events` 与 `/__presmium/presmium.server/control`。 |
| A 退出放映回到 Doc | 完整预览 iframe 被卸载，两条流都关闭；正文内剩余的是 block 预览，不占这两条流。未证实“返回 Doc 仍保留完整预览流”的假设。 |
| A、B 同时保持放映 | 四条 SSE，B 中普通 IR GET 返回 200，单次观测 23.9ms；没有出现双页阻塞。 |
| C 也进入放映 | 六条 SSE 均已返回 200，CDP 记录六个不同连接、协议均为 HTTP/1.1。C 已显示页面标题，真实动画模块尚未发出，画面停在“正在载入动画”。 |
| C 发起普通 IR GET | 同一浏览器请求的 `requestStart/responseStart` 均为 -1；独立 Node、同 cookie 的 GET 返回 200，12.6ms。 |
| 仅关闭 A | 未重发的 C 动画模块随后发送并返回 200，真实六柱动画出现；同一次 C IR GET 也继续完成。模块发送/收到响应为其请求起点后 639.7/643.0ms，IR 为 432.8/433.8ms。 |

这直接证实三个同时活跃完整查看器会耗尽该浏览器后端同源的 HTTP/1.1 连接槽，阻塞后续模块与普通 GET，而非服务端持锁或正文恢复守卫拒绝。关闭 A 只是差异探针，不是修复建议。最终八项诊断断言全部成立，不表示该产品边界已经修好。三个页面实测 `visibilityState` 都为 `visible`；未覆盖操作系统后台 Tab、任意 Tab 数量或所有浏览器。

## 源码归属与下一片边界

`packages/web/src/app/main.ts:145` 为完整查看器创建 site EventSource；`packages/host/src/control.ts:51` 创建课堂控制 EventSource。控制流会随 `stopHost()` 关闭，site 流在 inactive 时仅跳过更新，未随之关闭。当前 `DocumentView.tsx:129` 退出放映会卸载 `PreviewPanel`，其 cleanup 销毁预览池，因此本次普通返回 Doc 已正确释放完整查看器流。

下一片候选是为嵌入式完整查看器增加可注入的共享订阅接口，将 site 更新与 control 两个逻辑通道复用到已有 Studio 连接；独立查看器保留原 EventSource 回退。需保持文稿、app revision、control window、审批与取消归属，先核公开父子桥接接口。仅把两条 SSE 合成一条仍有容量上限；本次未实现接口、新协议或重试策略，也未关闭正常更新来规避问题。

## 冻结证据与清理

忽略目录中的消费者及证据：

- `.presmium/viewer-event-capacity.mjs`，SHA-256 `abb8fb0540382d69ab15c30f384d04dcae40e96dbc9e21cc7ed3a56f7bf38623`。
- `.presmium/viewer-event-capacity-1793117410584/result.json`，8/8，SHA-256 `936e6e4f1d435c2f791cc4092ddfbc114bbd2bf4c3b809728e7c7e1aa4135731`。
- 同目录 `final-manifest.json`，SHA-256 `0cfdf0b76ca37b0a1ea025c2cb2de41a660ccfd85780401873411441db9e75c8`；列出十一份相关运行源码起止/当前 SHA、两张已实际查看的前后截图、PID 与目录清理。
- `1793116940133` 前置尝试因未区分底层文稿/放映画面的重复定位器失败，随后清理观察器拒绝另有恢复记录；`1793117099751` 保留第三页动画等待 30 秒超时及前四项通过，未改为成功。最终尝试直接观测原模块的挂起与恢复，不靠等待其加载后才测连接。

最终 owner/backend/frontend PID 为 3753383/3755230/3755714，均已实际退出；浏览器、私有 home、workspace、fixture 全部清理。零 canonical 写入、模型、外网请求、页面异常和 HTTP 错误；三次尝试分别保留原始记录。没有运行测试套件，未访问公共 4320/17407，未修改作者文稿或运行源码。
