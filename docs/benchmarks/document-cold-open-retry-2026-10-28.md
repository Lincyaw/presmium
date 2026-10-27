# 首次读取失败后的正文重试

2026-10-28，隔离 worktree `authoring-diagnostic-producer`，基于 `219bf74c`。首次读取失败时尚无 DocumentSession slot，原 `retry()` 直接返回。现在无 slot 时复用 `open(active)`；已有 slot 的保存、IME、进行中事务与草稿重试路径保持原有行为。打开代次与目标文稿的检查继续拒绝迟到结果，disposed／无 active 时不发请求。

同一忽略目录消费者实际启动私有 Studio，以浏览器和官方 MCP SDK 操作；受控返回首次正文 GET 500 和首次诊断 POST 500，其余均为真实服务。

- 原记录 `cold-authoring-report-before-1793123182322/result.json` 前五项通过；点击原生“重试”后 2.5 秒无新 GET，整轮保留 `complete:false`。
- 修改后 `cold-authoring-report-after-1793123616352/result.json` 完整 7/7。相同按钮实际发起 GET 200，完整规范正文出现，原窗口错误贡献被清空。诊断发送失败只经显式重试接受，没有递归报告或自动重试风暴。
- 首次正文未读到时，MCP 错误没有 authoringSource／IR revision；恢复只清对应窗口的报告。两份规范 JSON 字节不变，没有生成、IR 准备或外部请求。

前后消费者脚本逐字节相同，十四份观测源各自在运行起止一致，只有 `document-session.ts` 相对原记录变化；修改后的 SHA-256 为 `508081b682369c9814230fee62c517dcd228718aa72f88062a97d0d871085ea3`。恢复后的桌面截图已实际查看；没有控件或 CSS 改动，不据此声明四组合视觉验收。私有浏览器、MCP、Studio 与临时目录均已清理。独立静审通过；未新增 tracked tests 或运行测试套件。

作者窗口诊断的其它约束与七源验证见[作者诊断记录](authoring-window-diagnostics-2026-10-28.md)。最终整合与公共部署范围另行记录，不能将不同基线的通过数相加。
