# 批注标记点击与正文光标

在一个新打开的文稿中，原生光标仍在第一页时，作者导航到复制页并点击其批注标记，DOM 光标曾到达正确段落，却在 click 后回到旧标题。此次只修复批注事件适配，不改变规范锚点、线程数据、正文选区实现或保存规则。

验证使用私有 Studio、真实浏览器和实际 CAS，基线为 `620889f9`，没有包含后来独立提交的排序、transport 或 DocScope 改动。运行源码只有两处：`document-editor/comments.ts` 与 `document-editor/BlockNoteSurface.tsx`。前者 SHA-256 为 `4087aa9d9c560976326fb415b11cab531fc0a0a02837397940daa4c9551cd7e4`，后者为 `91045c52e8749d7f67f4d22550ff7b8912fdcb2b9b2dfb8d440d3aa9f7815e6b`。

## 原因与实现

本仓库的 canonical anchor 和实际标记 DOM 都对应正确的 rich ID。未修复的同一 editor 中，首次点击未选中的标记会退到旧标题；立即再点已选中的标记则可正确定位。独立 before 重复了这一差异，未写文稿。

本地 vendor 没有 BlockNote 文档，因此读取了发布包的公开类型、原始 TypeScript 和官方 [v0.56.0 CommentsExtension](https://github.com/TypeCellOS/BlockNote/blob/v0.56.0/packages/core/src/comments/extension.ts)。它首次选择线程时同步发出装饰事务，并消费 click。此时浏览器已在 mouseup 放置 DOM 光标，但原生编辑状态仍可保留旧位置，装饰事务将旧光标重新显示。其已选线程分支不发该事务，所以第二次点击可以正常定位。

最终适配通过公开 `createExtension`、`runsBefore` 和 ProseMirror `handleDOMEvents.mousedown`，在浏览器放置光标前调用公开的 `selectThread(id, false)`。这里的 `false` 只关闭滚动到线程，不控制光标或焦点。实际光标仍由浏览器和 ProseMirror 处理；适配没有读取 DOM Selection、映射坐标或手设 Selection。

适配只识别官方 CommentMark 的 `data-bn-thread-id`／`data-orphan` 语义属性，并核对目标属于当前 view、原生位置表包含该线程、实际 ThreadStore 中的线程有效。只读、组词中、pending composer、非左键及已阻止事件保持原处理。这些分支做了源码和公开契约审查，未声称本片重验了真实操作系统输入法或 agent 只读流程。

一个 plugin 内的临时线程 ID 保留原生首次点击的消费语义，避免首次点击批注内链接直接打开新窗口。click 不再发装饰事务；下次 mousedown、取消、拖动、失焦、键盘动作以及挂载／销毁都会清掉该意图。已选或其它点击继续走原生链。Surface 只在原有 comments 启用时注册该扩展，没有自建批注工具栏、线程存储、事件重播、延时或计时器。

## 真实运行与保留记录

下列路径均在忽略目录。除标明的原基线工作树外，其余均位于 `.presmium/worktrees/document-comment-focus/.presmium/ui-evidence/`。

| 记录目录 | 范围与结论 |
| --- | --- |
| `native-comment-focus-1793115976236` | 原版 before 6/6：同一真实锚点，首次点击退旧 intro，第二次已选点击正确；重新从 intro 点击再次复现，0 源写入。 |
| `native-comment-focus-1793116121392` | 最初注册时漏调用 extension factory，类型检查发现后即停止，只有 2 个启动断言，不作为产品证明。 |
| `native-comment-focus-1793116213811` | 将预选仍放在 click 的候选失败，2/3；随后出现 `SlotAssemblyError: scope 'session-maybe' rendered without an installed adapter`。原红与异常保留，没有据此宣称成功。 |
| `native-comment-focus-1793116534514` | 预备 mousedown／首击消费版本 6/6，正确段落输入实际保存，线程与锚点完全保留；不是最终源码的整体验证。 |
| `native-comment-focus-1793116662659` | 纯 mousedown＋false 版本的实际链接反例：首次带标记链接新开窗口，证明需要保留原生首击消费。4 个断言通过，但整体停止且保留一个因链接拆分标记造成的严格选择器失败。 |
| `document-draft-durability/.presmium/ui-evidence/native-comment-focus-1793117206461` | 原版同链接夹具 5/5，首次 marked 普通／Control 点击均不开新窗，未标记链接两种点击均开一个新窗。所有出站请求拦截，未访问外网。 |
| `native-comment-focus-1793117208744` | 最终源码完成 33 个断言，31 过、2 红保留；核心光标、实际输入保存、批注回复、关闭重开和明暗四组合均有真实证据。不能将此数字称为 33/33。 |
| `document-draft-durability/.presmium/ui-evidence/native-comment-focus-1793117721965` | 原版相同连续两 click 3/3：两次均不开新窗口。最终源码也是 0／0，新旧导航没有差异；原先“第二次应开窗”的附加断言错误，原红未删除。 |

夹具来自前一轮真实保存的私有日常文稿，保留线程和 anchor。链接反例仅把标记范围内等长的五个字符设为链接，并在范围外加一个链接，原 anchor 偏移未改。链接导航由真实原生处理，弹窗和请求被记录、关闭和拦截，不以假响应证明导航。

最终版本首次点击 marked 文字后，native caret 和当前页都属于准确 rich ID。End 后输入经真实 CAS 只改变该复制页的正文 block；线程、anchor、其它页面、步骤、Narration 和 cue 完全不变。marked 链接普通／Control 点击与旧版一样不新增窗口，光标却由旧 intro 修正到正确段落；未标记链接继续保留原生导航。

原生回复键入时保留自身焦点，不写 canonical；Escape 弹出原生确认。dismiss 后完整未提交回复保留，但活动元素成为 BODY，因此“回复仍聚焦”的附加断言为红。显式重新点击该回复可继续输入；accept 丢弃不保存回复。随后实际保存另一条回复，只改变选中线程，原评论和 anchor 不变。清洁关闭 tab 后在同一 context 新 tab 打开，canonical 完整相同；首次 marked 点击与后续输入仍只修改正确段落。此片保留原生确认框后的 BODY 焦点边界，没有扩大修复。

明暗主题 × 1440／390 的四个原生线程／回复视图已实际查看。初图捕获了原生 popup 进入过渡，另保留原图；最终 `comment-native-stable-*.png` 等公开 `Animation.finished`，并断言 popup 与祖先 opacity 为 1。四组原生 caret 归属、回复焦点及横向范围通过，规范 JSON 不变。dark／390 的旧 620 工作台图同时出现“来源检查正在重新连接”Notice；不能用零 HTTP／pageerror 推断整个界面没有业务提示，此片没有修改或验证 transport 修复。

最终两运行源和其余 16 个监测源在构建前后、操作结束均未变。类型检查 1240 文件、分层、40 个样式令牌、技能检查与 diff 检查通过。各轮自有 browser、服务 PID、home、workspace、fixture 和私有授权 handoff 均清理；0 模型、0 生成，未碰公开服务、未新增受版本控制的测试、未运行测试套件或持久草稿矩阵。
