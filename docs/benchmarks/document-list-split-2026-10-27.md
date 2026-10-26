# 列表分段后保存与结构历史

在既有列表的甲项末尾按 Enter，产生位于甲、乙之间的空列表项；再按 Enter，原生编辑器将它变为段落。界面正确显示列表、段落、列表，但文稿回写给左右列表复用了同一个 ID，真实工作区服务以 `id.duplicate` 拒绝保存。

## 修改边界

`rich-text.ts` 在一次投影中共享已用列表 ID 集合。原 ID 首次使用时保留，分段后再次出现时为右组分配新 ID；连续组还记住本次原始身份，因此右侧后续各项仍归入同一个新列表。item 和内部 paragraph 的稳定 ID 保留。

`projection.ts` 的完整结构路径只创建一个集合，经各页、富文本 owner buffer、容器和组件递归传递。已复用的本域 blockquote、list 与 extension fallback 只登记其中的列表 ID，不修改插件私有 data。纯段落快速回写没有新增集合分配或全文扫描。原生结构历史继续使用现有 `structures` 快照保存富文本身份，没有新持久格式。

未改变 BlockNote 的 Enter/Backspace、不同 origin 的相邻列表分组策略、IR 契约或 DocumentSession 的保存错误队列。此次独立于此前首项保字与编号起点修复 `56ed3b30`。

## 原始复现

`.presmium/ui-evidence/doc-list-boundaries.json` 保存两条实际 Studio 流程的逐步 caret、原生 DOM 属性、replacement、验证诊断、HTTP 回执与磁盘 JSON：

- 在明确的乙项末尾连续 Enter 两次，可以正常退出列表，后续文字成为独立段落，原生内容、canonical 文稿和 200 回执一致。此前整旅程快连键的空项现象不等于这个明确光标流程必现。
- 两项列表中间分段后，提交为 `list(stable-list) / paragraph / list(stable-list)`，服务返回真实 422，指向 `/blocks/intro-body/content/2/id`。磁盘保留此前带空中间项的版本。Backspace 让原生内容重新连在一起，但已有保存错误仍使状态保持 dirty，观察窗口内没有新的 POST。

该记录的 `complete` 表示调查动作完成，八项观测检查不能解释为保存功能全绿。其中 `backspace-source-valid` 只确认旧磁盘仍合法，不表示新原生内容已保存。原失败截图和 422 原文保留。

## 最终实际结果

`.presmium/ui-evidence/doc-list-boundaries-after.json` 为 **16/16**，14 次真实 replacement 全部经公开 validator 接受，POST 全为 200，前端异常与失败 HTTP 均为零。

最终场景使用甲、乙、丙三项，以覆盖分裂后的连续右组：

1. 在甲后形成段落分隔，左组保留原 ID X，乙、丙同属新组 Y，所有 item/paragraph ID 保留。
2. 原生 Undo 恢复此前完整 canonical JSON；Redo 恢复同一 X/Y 和完整 JSON。
3. 此具体原生 Backspace 结构命中了已有三项结构快照，合回 X 并实际保存；再 Undo/Redo 精确往返，最后重开仍保留已保存的 X/Y。
4. 末项双 Enter 退出列表的对照也保留通过。

`.presmium/ui-evidence/doc-list-split-scope.json` 为 **11/11**，补充真实 DocumentEditor/BlockNote 公开 API 消费者：插入原生页边界后跨页 buffer 的列表身份、将原生项移入容器后的递归 buffer、以及嵌套富文本列表中的段落分隔。均保持右侧两项同组、全篇 validator 合法；跨页块图和右组 ID 在 Undo/Redo 后精确恢复，嵌套场景完整 canonical JSON 也精确恢复。这部分使用公开 `insertBlocks`、`replaceBlocks` 与原生历史，没有把它称为完整 Studio 手势或后端 CAS 覆盖；真实 CAS 由上一条 Studio 消费者承担。

补充消费者的首轮严格全篇 JSON 断言独立保留为 `doc-list-split-scope-initial.json`。跨页 Redo 的所有 block/list/item/paragraph 身份与内容都相同，但新建页的 `Step.visuals` 数组顺序改变。此次没有改步骤排序；最终跨页断言明确核完整 blocks 图、稳定 ID 与全篇合法性，不声称这条额外建页路径的全篇 JSON 顺序完全相同。

主 Studio 使用隔离客户端、动态端口、私有规范 JSON，浅色 1440 宽；另一个公开 API 消费者使用独立本地静态服务。没有操作公开 4320、17407 或作者文稿，没有新增 tracked 测试、运行套件或付费服务。自己的服务、浏览器和临时目录已清理，日志与原始 JSON 为私有权限。

轻量检查：类型检查通过（1168 文件），layering 与 diff check 通过。没有扩大到所有嵌套、插件或浏览器组合。
