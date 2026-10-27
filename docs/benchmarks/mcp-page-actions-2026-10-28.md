# MCP 常用页面动作

2026-10-28，隔离 worktree `mcp-page-actions`，基线 `47acebe5`。Web 与 MCP 共用 kernel 的新建身份／默认实体、重命名、移动和删除纯规则。Web 新建保留原生 `insertBlocks`、光标与 Undo；提交仍由原 `DocumentSession` 和 `DocumentEditor` 负责。没有新增 writer、任务队列或幂等账本。

MCP 使用 `plan_page_change` 和 `apply_page_change`，参数见 [接口说明](../../packages/mcp/README.md)。删除确认必须与计划中的 action、source、digest 一致；未引用的保留讲稿 cue 也会阻挡删除。合法删除保留共享讲稿、素材、定义和讨论，只清理归属内容、制作引用及实际命中的声明文本锚点。不遍历 opaque 数据中的 `id`。最后一页保留原标题与一个空步骤。

## 三份独立实际记录

| 消费者 | 实际结果 | 固定源范围 |
|---|---|---|
| Workspace HTTP＋官方 MCP SDK＋真实 DSH wrapper／pruner | 15/15 | 14 个运行文件起止及当前 SHA 相同 |
| 原版私有 Studio＋Chromium＋MCP | 11/11 | 同 14 文件及既有 DocumentSession，共 15 文件起止及当前相同 |
| compiler-only stdio＋官方 MCP SDK | 2/2 | 3 个 MCP 文件起止相同；如实不提供页面作者能力 |

协议记录实际覆盖：并发同请求固定四个身份、4000 ms／500 ms 默认时机、完整候选校验、资源文稿与 digest 范围、变化的同 ID 请求拒绝、丢弃真实成功 ACK 后同计划重试仅一次提交、HTTP 与 MCP 互相采用同实例计划、编辑后重命名和移动、旧源 409、删除显式确认、历史 Undo ABA 拒绝、未引用讲稿 cue 阻挡、共享讲稿和素材保留、片段／cue／覆盖清理、正确批注失锚及最后一页清空。required review 同时阻止新 HTTP／MCP 与原通用 apply；operate off 不登记提交工具。

50 页、400 段的真实文稿经公开 `connectPresmiumMcp` 与公开 DSH pruner 消费四种动作。预检为 1454–1708 个 pretty JSON UTF-16 字符，提交回执为 1149–1154；请求为 253–564 字符，均未触及 2048／7168 的接口预算，也未触发 8192 字符的真实裁剪器。标题包含引号、反斜杠、换行和 emoji。完整候选从按需资源读取，不要求模型回抄；通用大文写回和显式完整资源并未因此变成有界 API。

浏览器实际执行原生新建、创建 Undo／Redo、正文输入、Web 菜单重命名／移动、外部 MCP 新建／重命名／移动即时显示、原生编辑 MCP 新页，以及 Web 与 MCP 各自删除后的历史 Undo。创建 Undo 没有请求工作区 history，Redo 保留原四个身份；两个原页面正文保持不变。四组合为 1440／390 CSS px、亮／暗色，截图均已查看，没有新增控件或 CSS。

并发输入场景暂缓的是尚未到达后端的真实原生保存请求；MCP 随后采用另一页标题，再释放原请求。后端真实返回 409，浏览器保留 `LATER_NATIVE_INPUT` 草稿，磁盘保留 MCP 新标题，没有自动重提或清空输入。这是预期冲突，不能写成零 HTTP 错误。

主窗口 Undo 后的亮色截图仍出现旧“位置已移除”提示及忙碌图标，规范内容已恢复；其它三个新上下文正常。本片不宣称修复这一既有位置反馈边界，也不以重新打开的画面替换主窗口原图。没有运行放映、编译预览、ASR、TTS、模型、导出或测试套件，没有新增 tracked tests。

提交 `bf8efbdf` 后另做一次仅观察的私有窄链，独立完成 4 项，不与前三份结果相加。MCP 删除当前原生编辑的新页，再由真实 Toolbar Undo 恢复；没有再次点击或重开。连续原生 RAF 样本表明：规范内容与身份已恢复，0 ms 时列表忙碌，263 ms 后至 3013 ms 均无 `aria-busy` 或 loading 图标，原图的忙碌是过渡状态；旧位置提示则一直存在至 3013 ms。源码归属是 Workbench 在选中实体被删时清除 position 并保留 `documentPositionFailure`，Undo 内容恢复没有原目标可判定，提示通常等后续原生交互或有效选择清除。本轮只观察，不改变位置意图规则。15 个运行文件保持与原 Web 记录完全相同。

## 原始证据、失败与清理

记录在该 worktree 的 ignored `.presmium/`：

- `mcp-page-actions-1793120008677/result.json`，15/15，SHA-256 `6a92a7391e3535465f591b3815d12ee75644ef9a9b356ffecd349f91ee2a5906`。
- `mcp-page-actions-web-1793120606480/result.json`，11/11，SHA-256 `d1f1fa9aa4edca8f1f2ca8f854f989a662183c5e405fc08b787b674c23d0f40f`。
- `ui-evidence/mcp-page-actions-stdio-1793120907001.json`，2/2，SHA-256 `30e960c50246c31c3f651c7300c27049795510f8fde40ed75f899646d63784d2`。
- `ui-evidence/mcp-page-actions-final-manifest.json`，全部运行源、原始记录、脚本、截图和清理谱系。
- 后续窄观察 `mcp-page-undo-observe-1793121629452/result.json`，4 项，SHA-256 `4e7606c34c0b32a133839f02f800dd4a9686dd7697e52a120c1a0a047ce6c51e`；`ui-evidence/mcp-page-undo-observation-manifest.json` 单独保留谱系。三个自有 PID 均退出，客户端、Studio 与私有材料全清，0 HTTP 错误、运行准备请求、外发或模型请求。

失败不覆盖：首次原料校验在服务启动前退出，随后纳入 finally 的 0 项记录保留了不合法 narration/cue 时机字段；只修正私有材料为真实 schema。首轮 Web 完成 3 项后，消费者使用旧导航 DOM 类名而停止；截图与磁盘顺序正确，只修 ignored 观察器为当前公共排序列表的稳定身份。对应 `mcp-page-actions-web-1793120402162` 原失败、截图和执行脚本均保留，不与 11 项相加。

两轮 Web 的六个 owner／backend／frontend PID 均已核实退出；所有自有客户端、Studio、临时工作区和 fixture 均清理。协议服务与 stdio 客户端也已关闭，私有目录删除。公共 Studio、主目录、模型配置和费用服务未操作。

轻量类型检查通过 1243 文件，分层、技能、40 包发布结构和 diff 检查通过。保留原五分钟、64 plans／64 receipts、process-current-source 边界；没有单独等待真实 TTL 到期或把未运行的重启／无限 ABA 当成保证。评论、完整历史语义动作、播放控制与通用超大写回仍属其它切片。
