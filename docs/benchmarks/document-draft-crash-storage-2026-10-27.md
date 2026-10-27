# 草稿备份：浏览器崩溃反例

2026-10-27，隔离工作树 `document-draft-durability` 的 localStorage 首版未通过真实浏览器崩溃验证，未部署到公共 Studio。正常关闭和显式恢复通过，不能据此将“崩溃后恢复”标为完成。

## 已确认的反例

消费者使用真实 Studio、原生正文输入、持久 Chromium profile 与实际离线状态。`lecture.json` 始终保留原内容，没有成功保存请求、模型调用、浏览器错误或 HTTP 失败。

1. 输入 `NORMAL_UNSAVED`，在最后一次 `setItem` 后 17 ms 正常关闭整个浏览器，再用同一 profile 启动新进程：完整草稿仍在，文稿没有自动恢复或写入。
2. 明确恢复该草稿，再输入 `CRASH_UNSAVED`。同一次观察取得的原生正文和最后 localStorage raw 均含新文字。
3. 在该 `setItem` 后 24 ms 向自有 Chromium 主进程发送 `SIGKILL`，确认 PID 退出，再从同一 profile 启动新 PID：仅剩前一份 NORMAL 记录，最后 CRASH 记录不存在。

因此，localStorage API 返回且当前进程能读回，不足以证明最后输入已经落盘。此轮三项检查中前两项通过，第三项真实失败；没有延长等待、改为正常退出或将仅 renderer 崩溃算作通过。原始文件的 `complete` 保持 false。

原始结果为该工作树 `.presmium/ui-evidence/document-durable-process-1793106207453/result.json`，SHA-256 为 `547f94ac731f2ba965c764254d236ac67df3de47fef330f480ea47f1ff99c33a`。它记录构建时六份前端源码 SHA、实际客户端 SHA、原生输入、最后 raw、两个时间间隔和重开后的记录。三次 Chromium 主进程、私有前后端及 profile／home／workspace／fixture 均已清理。未操作公共 4320／17407 或作者文稿。

较早的 `document-durable-process-1793105928600` 在正常退出阶段因消费者抓取了旧 revision 停止，未进入 kill。修正为原子读取最后 write/raw 后才得到本反例；该早期失败保留，不计为产品存储丢失。

## 实施决定

下一步验证并采用 IndexedDB 的 strict 事务备份，以实际 transaction complete 确认对应输入版本，而不以 localStorage 返回作为持久确认。W3C 将 strict 定义为持久性提示；仍需实际浏览器进程退出验证，不能仅凭选项存在承诺所有设备或断电场景。[IndexedDB 事务规范](https://www.w3.org/TR/IndexedDB-3/#transaction-durability-hint)

备份仍是未提交编辑状态，唯一权威内容入口仍为 `lecture.json`。同步抢救副本可以保留，但必须与已确认的持久备份区分；旧事务完成不能清除新输入，退役原草稿前必须确认新副本提交。未完成的事务、尚未进入编辑器的输入法预编辑以及用户清除站点数据不属于已确认备份。IndexedDB 路径尚未在本记录中验收。
