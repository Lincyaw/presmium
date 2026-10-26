# 运行文稿根属性的实时更新

2026-10-27，在音频片段保存后自动准备当前版本时，父页面的播放按钮持续不可用。页面没有 HTTP 失败或前端异常，但实际播放回执为 `production-binding-stale`。

## 根因证据

`audio-binding-probe.json` 通过公开服务、真实消息与 React `useDoc` 读取同一 iframe：父计划、iframe 读取的计划与讲授轨具有相同的新 source、IR revision 和 planId，计划／轨请求均为 200；实际 viewer 文稿的 `meta.presmiumRevision` 已更新，`source.version` 和 fingerprint 却仍是旧值。导航位置在真实轨的 `go` 事件中存在。绑定校验拒绝这个混合版本是正确行为。

Node 的独立对照 `audio-plan-runtime-boundaries.json` 为 5/5：同源 query 与 `Presmium-Document` header 请求得到相同完整绑定，同源重算 planId 不变，计划与轨互读成功，普通导入／clip 保存只挂载一次 server contribution。没有证据支持修改缓存、扩大保留数量或弱化 planId 检查。

遗漏发生在 `LiveUpdate`：旧协议只传 meta、config、章节与诊断，没有传 IR 顶层的 source、production 和 productionAssets。实时更新采用新 meta 时仍保留旧 source，运行文稿因而与它所声明的 revision 不一致。旧失败现场保存在 `audio-editor-auto-prepare-plan-failure.json/png`；准确的业务错误码来自后续公开消息记录，没有把提示文字转述成 Node 的 `production-plan-changed`。

## 协议修复

`LiveUpdate.document` 在根属性改变时携带除 sections、diagnostics 外的完整根快照。章节仍只传变化项与顺序，诊断保持原通道。采用更新时以根快照为基准，再拼接章节与诊断，因而可通过正常 JSON 序列化删除可选根字段，无需 `undefined` 删除标记。

原 meta／config 两个独立 wire 字段已移除；双方使用同一份协议，没有第二种根属性来源。未变化的章节继续复用已有对象。Node 缓存、版本／planId 校验、播放器和 React effect 时序都没有为此修改。

## 结构与真实 IR 验证

`viewer-root-live-proof.json` 完成 13/13 项忽略目录中的消费者检查。前后基础快照来自独立临时文稿的真实 Compiler 编译，修改了媒体入出点、音量与素材标题；其余变体用于检查合法 IR 结构的章节、顺序和诊断传播。

- 原协议确实保留旧 source、production 和 productionAssets；新协议经 JSON wire 往返后与新运行文稿等值。
- 只有根变化、没有章节变化时仍发出更新；source、production 与 assets 各自独立变化也不会被省略。
- 可选根属性删除后不会从旧文稿残留；未变化章节保留原引用和顺序。
- 章节重排、单章节变更与诊断正确采用；只有诊断变化时不重新发送根或章节。
- 同一文稿或 JSON 深等值副本不产生 patch。

首版消费者把对象键顺序当作内容语义，产生一次断言失败；该记录保存在 `viewer-root-live-proof-first-oracle.json`，随后改用深结构比较。没有为这次断言修改产品代码。消费者没有使用网络、模型或 Studio，独立临时目录已清理，未新增受版本控制的测试或运行测试套件。

## 同一运行窗格的实际结果

新的隔离 Studio 采用同源 Node 与 viewer 协议，`audio-editor-live-root-after.json` 完成浅色 1440 宽的一次 21/21 真实流程。保存片段后，原 iframe 节点仍保持连接；公开 `useDoc` 读取的 source.version、production.mediaClips、productionAssets 和 revision 与新保存版本及播放器绑定一致，自动准备没有自动开始播放。

随后实际点击播放、暂停、第二步、第一步，公开播放器回执确认当前保存版本和稳定 Step ID。原始音频 SHA-256 与讲稿字幕保持不变，前端异常、HTTP 失败和生成请求均为零。此处引用这些根属性与播放结果，不将单次浅色桌面记录扩展成四种界面组合验收。
