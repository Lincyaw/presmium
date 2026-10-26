# 页面结构与原生字段验证（2026-10-26）

保存等待期间，作者可以回到已有动画的第二步讲稿继续输入。结构更新用瞬态的原生 ProseMirror 文档、选区 bookmark 与内容指纹恢复同一字段；唯一持久源仍为 `lecture.json`。恢复目标包含文稿身份、reset、组件、步骤、讲稿和 slot，作者后续交互会取消迟到的新页聚焦。

独立消费者使用真实 Studio API、实际 CAS 响应延迟、BlockNote 字段和文件写入，覆盖新增页、重排与重命名。多段文本、中间 caret、连续输入、cue、发音和停顿均保留；证据为 `.presmium/ui-evidence/page-field-focus-{create,move,rename}-multiline.json` 与 `page-field-focus-continuous.json`。

实际工作台整合验证又发现：重排后的 ResizeObserver 将新首段当成作者滚动，把当前页切到另一页，导致第二步字段卸载。修前证据保留在 `app-page-field-focus-move-before.json`。滚动观察现在从作者实际 pointer、wheel、touch 或导航键交互开始，源结构 reset 本身不改变当前位置。

同一真实界面复验通过：

- 新增页等待真实 CAS 时继续输入两段，迟到结果不抢焦点；新页创建成功，原页第二步和字段 caret 保留，后续文字真实存盘。`app-page-field-focus-create.json` 的 8 项检查通过。
- 重排同样保留第二步字段及中间 caret，后续文字、cue、发音、停顿均保存；真实滚轮向上和向下仍更新可见页面。`app-page-field-focus-move.json` 的 9 项检查通过。
- 两项整合验证均没有浏览器异常或失败 HTTP。重命名的实际界面使用模态框，等待保存时不能点击外部字段；该期间的字段编辑仅在上述独立 canonical API 消费者中验证，没有声称整合界面允许此交互。

`iframe-native-selection.json` 另在真实工作台先直接播放内嵌动画，测得局部时间推进到 248ms，再用鼠标从动画上方正文拖到下方正文。浏览器原生选区保持一个完整范围，端点为 `before-p` 和 `after-p`，canonical 文稿未变化；5 项检查通过。没有增加 DOM range 桥或拦截正常 iframe 操作。

类型检查通过，未新增测试、运行测试套件或完整示例构建。
