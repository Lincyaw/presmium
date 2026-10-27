# Undo 恢复后的失效位置提示

2026-10-28，隔离 worktree `document-position-notice`，基线 `9d5d5761`。只修改 Workbench 对既有“位置已移除”提示的归属，不修改页面语义服务、DocumentSession、历史事务、控件或 CSS。

删除当前稳定目标时，提示记录原 identity、SectionID／StepID、精确 version／fingerprint，以及现有 document scope、selection generation 和删除更新后的 position token。只有后续干净且没有保存飞行、恢复或组词的规范源精确返回，目标仍符合原归属，提示 owner 也未变化时，才清除这条提示。这个更新不设置 position 或 navigation，不恢复焦点、滚动或选择，也不写返回位置。后续有效选择、文稿切换、新提示或错误优先；仅 ID 字符串相同的新源不能清除提示。它不是第二份 history 或内容 writer。

I01／I02 的原有输入与版本规则继续适用；界面复用 `PmNotice`，没有新控件、素材或 Figma 节点。

## 真实私有验证

原反例为 `bf8efbdf` 上独立的 4 项观察：真实 Toolbar Undo 已恢复页面与正文，列表忙碌图标在 263 ms 内消失，而旧提示持续至 3013 ms。原始 raw SHA-256 为 `4e7606c34c0b32a133839f02f800dd4a9686dd7697e52a120c1a0a047ce6c51e`。本 worktree 的 ignored `ui-evidence/document-position-before/` 是原 JSON、执行脚本和原图的逐字节副本，附原路径及 SHA；原页面动作 bench、raw 和提交未修改。

新源固定为 Workbench SHA-256 `82196493b764424ef6b57193f5a381fd67f42c8466bf3934719037a77b0849a3`。实际原版 Studio、Chromium、Workspace HTTP 与官方 MCP SDK 验证以下行为，没有模拟保存、回执或源结果：

- 不恢复被删页面时，提示保留；真实 Undo 回到原 version 后，提示消失，规范正文和身份恢复。没有选中页，没有送焦点进编辑器，scrollTop 保持 0。
- 1440／390 CSS px、亮／暗四组合各有删除后与恢复后截图，8 图均已查看，正文仍为单一原生编辑器。
- 真实通用事务恢复相同 SectionID／StepID 但更改标题的新源时，提示仍在；随后只有精确原源恢复才清除它。
- 暂缓后端已真实返回的恢复源 GET，其间原生选择 B。释放旧读后，B 的选择、按钮焦点和 scrollTop 32 保留。
- 同样暂缓真实 GET，其间在 B 原生输入。释放后，实际源冲突提示保留本地输入、editable 焦点与 B 选择，磁盘没有被本地草稿覆盖。本轮由 GET 检出冲突，没有 HTTP 409；不混入旧页面动作那轮 POST 409。

这些是第二轮中的 9 条已通过断言，该轮末尾因为消费者选择了仅 standalone 显示的“返回文稿列表”按钮而超时，整轮 `complete:false`。实际 Studio 使用 AppBar 的 Documents 入口。该失败及截图、执行脚本和 raw 原样保留，不能改写为完整通过。

首轮也保留：精确 Undo 后提示已消失、正文恢复、scrollTop 0，消费者却要求焦点必须仍在 Undo 按钮而失败。实际公共按钮在 loading／disabled 时可以正常失焦到 BODY；本片没有修改这个原生行为，后续断言只检查不主动聚焦编辑器、不改选择或滚动。

切文稿边界改为单独的实际消费者，完整 3/3：后端真实恢复旧文稿的 GET 被暂缓，作者通过 Studio 公共 AppBar Documents 入口打开另一个 identity；在新文稿删除当前目标产生新的提示后，释放旧 GET。新提示、BODY 焦点和 scrollTop 0 均保持，旧回执没有清除新的失败。新文稿故意复用相同页面／步骤字符串，仍由真实 identity 隔离。没有重跑已验证的四组合或合并总分。

| 原始记录（本 worktree 的 ignored `.presmium/`） | 状态 | SHA-256 |
|---|---|---|
| `document-position-notice-1793122197872/result.json` | 1 条通过后错误 focus oracle，整轮未完成 | `afac938c942b679a8d8de1c4ff001a05893e038deb438c10ceec7cd88ffbc8c1` |
| `document-position-notice-1793122346821/result.json` | 9 条通过后错误返回入口 locator，整轮未完成 | `24fcd0bcaf1068c2cbb4f50f45aa8f5feda65d222543b302194ae0c6f560768c` |
| `document-position-notice-scope-1793122534573/result.json` | 独立 scope 接缝完整 3/3 | `dec9ca2d6f374599b7baef60d87251f7a1086772914d30407b7132818e880b0d` |

三轮始终使用同一运行源码。两个未完成 raw 未记录末尾源快照，最终清单另行核对其起始 17 SHA 与当前值；第三轮完整记录起止 17 SHA，均与当前相同，不补写前两份原始记录。九个自有 owner／backend／frontend PID 均已退出，所有自有客户端、Studio、临时工作区与 fixture 全清。各轮 page errors、HTTP 错误和已记录的运行准备／外发／模型请求均为 0；后输入例保留的是实际读源冲突。

完整性与资源清理的最终准确路径见 ignored `ui-evidence/document-position-notice-final-manifest.json`。轻量类型检查通过 1243 文件，分层、技能与 diff 检查通过。没有新增 tracked tests，没有运行测试套件、IR 准备、模型、ASR、TTS、录音或导出；公共 Studio 和主目录未操作。
