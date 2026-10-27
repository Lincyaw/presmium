# 日常编辑中的排序手柄焦点

从正文点击页面排序手柄后，空格应启动原生键盘排序。固定 `620889f9` 的真实工作台中，手柄未取得焦点，随后的空格实际保存到了另一页的标题。此次只在公共 `PmSortableList` 的手柄上增加主指针按下捕获处理：调用该按钮的原生 `focus({ preventScroll: true })`。不阻止默认事件，不改 dnd kit 传感器、按键、取消、异步提交或焦点恢复规则。

验证在独立工作树 `daily-sortable-focus` 中完成，基线为 `620889f92b6b2a9642d2b4ef94395b7debee27a8`。唯一运行源码改动为 `packages/workbench/src/sortable-list.tsx`，SHA-256 为 `dcd8c4a136bf1cab8b4d95deac3f829ae008f3519160cf91781030d014dc8ee7`。使用真实 `examples/animations/bubble-sort` 私有副本、独立 Studio 服务和隔离构建；没有使用公共端口、作者文稿、模型或测试套件。各轮原始数据均在忽略目录，消费者使用真实浏览器和实际文稿 CAS。

## 原因与本次边界

原始日常链 `.presmium/worktrees/document-draft-durability/.presmium/ui-evidence/native-daily-authoring-1793112919428/result.json` 保留了正文输入、加粗、Enter、新建页后继续输入、重命名和复制的结果。之后真实指针命中复制页的手柄 SVG，但没有手柄 `focusin`；指针释放后活动元素仍为原生正文编辑器。空格的受信任 `keydown`、`beforeinput` 和 `input` 都发给正文，规范 JSON 的 `intro.title` 增加前导空格，没有排序请求。

一次私有 DOM 捕获焦点反事实使空格进入正确手柄，也出现原生拖动源和 inert 占位。该轮随后误用严格单行选择器，并在 Escape 期间发生 `SlotAssemblyError: scope 'session-maybe' rendered without an installed adapter`。原异常、截图和失败动作均保留；此轮不作为完整排序通过证明。原消费者资源已清理。捕获处理本身仅改焦点，没有创建 React scope；本次未确定该 Harness 异常的原因。

候选使用公开的 [useSortable handleRef](https://dndkit.com/react/hooks/use-sortable/) 和[默认 KeyboardSensor](https://dndkit.com/extend/sensors/keyboard-sensor/)，继续由依赖处理拾起、移动与取消。正式控件复用 Figma [SortableItem / Compact / Focus](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=158-2804)；已实际读取高保真设计和截图。没有新增图标、状态、CSS 或尺寸令牌。

## 实际结果

两轮候选的 19 个运行源码 SHA 在构建和操作期间保持一致。

| 记录 | 实际范围与结果 |
| --- | --- |
| `daily-sortable-focus/.presmium/ui-evidence/native-daily-authoring-1793114499730/result.json` | 14 个断言通过。新 owner 无行为观察器或运行时模块注入；正文编辑、创建、重命名、复制后，同样的手柄点击立即聚焦正确按钮；Space、ArrowDown、Space 实际 CAS 只改页面顺序。返回正文只编辑复制页，原标题不再增加空格。真实保存回执挂起时输入保留，回执释放后手柄焦点可用，Space／Escape 保持编辑器存活。 |
| `daily-sortable-focus/.presmium/ui-evidence/native-daily-authoring-1793114750466/result.json` | 消费者完成，34 个断言中 33 个通过，另保留 7 个失败动作；不能称日常编辑全部通过。实际保存 200 回执被挂起后，作者重新点击正文并继续输入，旧回执未夺焦点或删除新文字。正常分步的原生拾起、方向键、放下已实际改变页序，提交只改 `sectionOrder`；随后返回复制页继续输入成功。 |

第一轮候选补第二个回执反例时，消费者在 `route.fulfill` 完成前解除路由，出现未处理的 `Route is already handled` 并退出。原 raw 没有改写为完成；独立 `harness-exit-cleanup.json`、`fixture-cleanup.json` 保留该事实。后续消费者对真实请求使用单次路由，等实际 fulfil 完成再继续，成功验证旧回执与更晚正文焦点的关系。此观察器错误不属于产品改动。

第二轮的其余日常动作包括：

- 原生批注选区覆盖复制页的准确 rich ID；Escape 取消没有写入线程，保存后的线程 anchor 与选区两端一致。
- 在 `pass--step-2` 编辑字幕，实际 CAS 只改变该步所绑定的 Narration；原 cue 的 ID、action、target 和 parameters 完整保留。基本“动画后”选择只写该 StepID 的开始时机。
- 显式页面导航按既有 `goToSection` 规则回到第 0 步；再次选择第 2 步能读到已经保存的字幕和时机，没有错写其它 Narration。最初误以为显式导航应保留第 2 步的等待失败保留在 raw。
- 已保存后真实关闭 tab，再在同一 browser context 新 tab 打开。规范 JSON 字节完全不变，五页、正文、加粗、原生 Enter 的新段落、创建／复制页身份、批注、cue 和时机保留；始终为 Doc 的单个正文编辑器，未隐式打开 Video／Present，没有生成请求。新加载的保存状态为 `idle`，可见文字为“已保存”；最初只等待新 ACK 的 `saved` 属性导致超时，保留原记录。
- 明暗主题、1440／390 四组合分别验证手柄点击焦点及原生 Tab／Shift+Tab 的 `:focus-visible`，均无横向溢出，未写规范 JSON。此次 390 组合使用普通指针，控件沿既有 Compact 30 尺寸；不称粗指针或显式 Touch 变体已重验。

四张 `sortable-handle-{light,dark}-{1440,390}.png` 均已逐张查看。第二轮前端异常与失败 HTTP 均为零，模型请求为零；资源在其原 `finally` 中关闭，浏览器、服务 PID、私有 home／workspace／fixture 与授权 handoff 全部释放。

## 保留的真实缺口

极快的 Space／ArrowDown／Space 仍可能在原生拖动初始化期间没有提交。第二轮保留了这次失败；手柄焦点正确，没有正文空格污染。用“已拾起”读屏文字作为唯一启动条件也不可靠，它可能已被 `dragover` 的位置文案替代。本片没有重放按键、加固定等待或修改传感器，未声称修复已有的[快速键盘时序边界](sortable-keyboard-timing-2026-10-27.md)。

新 tab 中另发现一处批注标记焦点缺口：选择复制页后，受信任指针确实点击该段落的 `.bn-thread-mark`，`pointerup` 时 DOM 选区曾位于正确段落，`click` 时又恢复到旧 `page:intro`，当前页随之改变。点击同段未被批注覆盖的 `AFTER_SORT` 尾部则保持正确原生位置。未键入，也没有规范 JSON 写入。此为第二轮唯一失败断言，对应 `new-tab-trusted-copy-body-click-focus-cause` 与 `reopen-unmarked-tail-native-click-control`；本片没有修改 comments、正文选区或 SourcePanel，不能称日常流程全部闭环。

其余失败动作包括未限定 toolbar 的“字幕”按钮严格匹配多个元素，以及将刚加载的干净状态误认为一次新保存 ACK。这些动作及截图保留，不以重命名断言覆盖。

本片轻量检查：类型检查 1240 文件、分层检查、40 个样式文件令牌检查和 `git diff --check` 通过。未运行测试套件、完整示例构建、模型、公开服务或新一轮持久草稿 kill／quota 矩阵。
