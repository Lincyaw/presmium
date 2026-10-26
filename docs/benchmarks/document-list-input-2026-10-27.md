# 原生列表输入的文稿回写

在真实 Studio 中输入 `- 列表甲`，按 Enter 后输入 `列表乙`，原生编辑器仍显示两项，但保存请求和磁盘文稿丢掉第一项。另一个实际输入 `3. 三号`、Enter、`四号` 在当前编辑器显示 3、4，重开却变成 1、2。

## 因果与修改

正文段落经 BlockNote 的原生输入规则变成 list item 后，富文本适配器沿用了同一 native ID 对应的旧 paragraph `original`。下一次结构回写捕获了新原生节点的 baseline，却仍保留旧类型内容；未修改节点的复用分支因此把旧的 `"- "` 段落写入 replacement。`doc-list-first-item-before.json` 同时保留输入前后原生 DOM、可信键盘/input 事件、真正的 document/change 请求和磁盘文稿，第一项文字在进入后端前就已缺失。

列表身份更新现在只清除不兼容的 `original`，保留 list、item、内部 paragraph 的稳定 ID。未改变原生输入规则、正文历史、保存队列或 CAS。

编号列表原先只从投影身份缓存读取 start，漏掉原生输入规则新产生的公开 `block.props.start`。新建编号 group 时改读当前属性，删除过期的 listStart 缓存；文稿投影到首个原生 item 的 `node.start` 写法保留。

## 实际验证

所有消费者使用独立规范 JSON、隔离客户端、动态端口和真实 Studio 工作区服务，初次启动前完成私有客户端构建。浏览器为 Chromium、浅色、1440 宽。没有操作公开 4320、17407 或作者文稿，没有新增 tracked 测试或运行测试套件。

| 记录（`.presmium/ui-evidence/`） | 结果与覆盖 |
| --- | --- |
| `doc-list-first-item-before.json` | 5 项中 4 项通过，逐项文字断言失败；原生 DOM 有甲、乙，提交与磁盘缺甲 |
| `doc-list-first-item-after.json` | 首项修复后的 12/12；甲、乙、结构 Undo/Redo、数学原子及粗体、保存重开 |
| `doc-list-first-item-final.json` | 两处最终源码上的同序 12/12；0 前端异常、0 失败 HTTP |
| `doc-list-start-before.json` | 3 项中 2 项通过，原生 3/4 与 canonical 缺 start 不一致；重开为 1/2 |
| `doc-list-start-after.json` | 8/8；canonical start=3、重开 3/4、继续编辑、原生 Undo/Redo、再次重开，稳定 ID 保留；0 前端异常、0 失败 HTTP |

列表结构 Undo 恢复完整规范 JSON，Redo 恢复同一变更，再次 Undo 的 list/item/paragraph ID 与保存前相同。原子场景先用真实鼠标定位可编辑文字，并确认实际 native caret 位于文本末尾；转换与下一项输入后，数学原子 `x^2` 和粗体文字仍保留，磁盘与重开内容一致。编号场景也用真实文本位置继续输入，保存后的 Redo 在第二次重开仍显示 `3. 三号编辑`、`4. 四号`。编号重开截图已实际查看。

消费者的中间定位失败记录独立保留：一次鼠标命中不可编辑数学原子，一次错误假定 End 已到原生文本末尾。最终消费者以真实鼠标和原生 selection 条件确认目标，没有修改产品代码来迁就定位。

## 旅程覆盖与限制

最初 `doc-first-journey.json` 完成正文、新页、格式、重命名、复制、菜单及拖动重排、删除、两类 Undo/Redo、字幕与配音开始、返回正文、离线草稿重载等流程，记录 12 个操作、16 个通过检查。但列表断言只检查乙，截图实际揭示甲丢失，因此不能把它当成完整内容通过。随后 `doc-copy-continuation.json` 的 8/8 以真实 caret 和保存确认排除“复制后不能直接续写”的候选。

加强后的 `doc-first-journey-after.json` 在“列表恰好两项”断言处停止，4 项中 3 项通过。甲、乙文字都已正确保留；快连 Enter 的原生状态仍有空项和后续列表内容，native 与文稿一致。本次不把该整轮记为全绿，也未据此另改 BlockNote 的 Enter 行为。首项丢失和编号起点各自由上表的定向消费者闭环。

本次没有验证任意中间 item 重新起编、所有列表嵌套组合、所有浏览器或系统输入法，不扩称四种视觉组合已经重验。既有原生机制和正文保存边界没有增加延时或另建历史。

最终轻量检查：类型检查通过（1168 个文件）、layering 通过、diff check 通过。自己的浏览器、服务与临时工作区均已清理，日志和 JSON 为私有权限；未推送。
