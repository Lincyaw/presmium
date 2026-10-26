# 原生讲稿字段验证（2026-10-26）

动画卡片的讲稿字段编辑同一份 `lecture.json` 的 `NarrationNode[]`，没有额外字幕文本源。字段使用公开 BlockNote 编辑器和 React 根，位于公开的 open ShadowRoot 内，使字段的原生选区、输入与撤销不被正文 ProseMirror 接管。公共样式入口在该根内复用，颜色和控件几何仍来自设计系统。

`.presmium/ui-evidence/native-narration-consumer.json` 的真实 Chromium 消费者验证：

- 字段实际嵌套在正文的只读组件节点中。点击字段、按 Ctrl+End 输入，再原生 Undo/Redo，正文 JSON 没有变化；cue 的目标、参数和发音节点保留。
- 字段关闭公开的自动尾块选项，原生 Enter 仍保留作者输入的换行；不会自动保存一个额外尾段。
- 通过发音原子的公开编辑操作修改实际读音，保留显示文字和 typed pronunciation 节点。
- 旁路讲稿更新后立即输入正文，正文原生 Undo 仍保留最新讲稿、制作设置和定义数据。
- 正文删除场景后，后来改过的讲稿不会被正文结构 Undo 回滚；因正文删除而移除的 cue 和停顿恢复。作者提前自行移除的 cue 不会被正文 Undo 重新加入。
- 实际 JSON 文件保存、重新打开后继续编辑，领域校验通过。最新源 getter 拒绝身份时，正文回调不回退到旧 props。
- 明暗色、1280 与 390 宽的四组截图均无横向溢出。普通字段字号为 13px；真实 coarse 环境为 16px，字段内按钮至少 44×44。

`narration-cue-copy-review.json` 使用原生跨字段 Ctrl+A/C/V：原 cue 保留 ID，副本得到新 UUID，校验无错误。复制在公开 `transformPasted` 中处理，不重写加载或 Undo 的原节点，也不复制制作停顿。

`narration-emission-revert-review.json` 确认字段先写 A、再写 B，随后外部采用 A 时，显示值回到权威 A。自己的未确认输入回执按队列消费，历史上曾输入的值不会永远被当成回执。字段可使用当前 actor getter，避免跨 React 根的迟到 props 覆盖最新源。

`native-domain-history.json` 另重跑了正文组件及子树、步骤、cue、停顿与页边界的 Undo/Redo 和五次文件写入、重开，均通过。系统输入法的完整组字过程没有在本消费者中验证。真实工作台卡片、保存服务和字幕播放由集成验证另行记录，未用独立消费者替代。

运行了相关工作台类型检查和设计令牌检查；没有新增测试，也没有运行测试套件。
