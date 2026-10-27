# 原生表格编辑与批注保存

2026-10-27，使用独立随机端口 Studio、私有 git 文稿及真实工作区服务验证 BlockNote 表格。规范内容只有 `lecture.json`，观察器原样委托 `attachDocumentEditor`，只读取公开编辑器、选区、批注扩展与 Workbench 状态。没有操作公共 4320／17407 或作者文稿，没有新增 tracked tests 或运行测试套件。

## 原有编辑能力

`document-table-authoring-before-merge.json` 19/19，14 次规范文稿写入，浏览器错误、HTTP 失败与生成请求均为零。小文稿包含正文、2×2 表格及尾段，行与单元格使用固定 ID。

- 原生输入后保存，原行、单元格及前后正文 ID 保留。
- 官方菜单插入行列、删除新增行列，跨越原单元格的批注仍指向原 ID。
- 原生两单元格 `CellSelection` 创建的批注覆盖 A 与 B；正文跨表格的文本选区批注保留两端 ID。
- 删除作为批注终点的原列时，原生批注范围随事务映射到存活单元格；Undo／Redo 恢复相应完整规范图与原 ID。重载后 3 条线程及原生标记恢复。

原有定制格式工具条遗漏了公开 `TableCellMergeButton`，因此这份记录没有把合并／拆分称为已提供能力。此次只在原工具条中加入该官方组件，保留原生图标、可用条件、菜单、事件及 `AddCommentButton`。

## 合并后确认的两个适配缺陷

`document-table-authoring-merge-before.json` 保留真实失败与后续隔离：

1. 部分列调整了宽度后，合并给出原生列宽 `[0,120]`。投影只排除 `undefined`，把未定宽哨兵 0 写入要求正数的规范契约，真实 POST 返回 422；同一 replacement 去掉该列宽后校验通过。该列调整最初由消费者误触边缘产生，随后保留实际原生状态，没有把它当作必然发生的合并前置条件。
2. 干净重载、没有列调整时，原生合并成功并保存 200。内容是 A、换行、B，原生跨单元格批注仍覆盖两段；但 `nativeTextPoint` 只按 `firstChild` 长度计算，把规范终点截成 A 的 offset 12。重载后 B 的批注标记真实消失。这与列宽问题独立。

修复不放宽文稿契约：只有全部列宽均为有限正数时才保存列宽；未定宽继续使用原生默认布局。表格单元格的原生段落边界与规范单个 `break` 做双向坐标换算，既计算全部段落，也能在重载后按同一规范 offset 恢复标记。未知 target 的原有未找到路径保持不变，不猜测其他单元格。

## 修复后的真实边界

`document-table-authoring-merge-after.json` 中 14 项核心检查全部通过，7 次真实规范 POST 均为 200，浏览器错误、HTTP 失败、生成请求均为零：

- 官方合并保留 A 与 B 的全部文字、换行、`colspan=2`，以及存活行、单元格 ID。跨单元格和正文批注终点均为 `cell-a:22`，覆盖 B 的末字。
- 合并 Undo／Redo 恢复各自精确的规范图及全部批注锚点。
- 官方单元格菜单拆分后，内容保留在原单元格，新空单元格得到唯一新 ID；拆分不恢复此前被合并的 B 单元格或重新分配文字。Undo／Redo 保留对应完整图及新 ID。
- 拆分后重载，新的单元格 ID、3 条线程、B 的全部原生批注标记仍在。
- 真实鼠标调整部分列宽后，原生合并给出 `[0,172]`；规范省略未完全确定的列宽，保存 200，原文与批注终点保留。

这份综合记录共有 25 项观测，23 项为 true，不能称为 25/25。即时读取菜单可见性的一项为 false，随后同一菜单已有拆分项且实际拆分成功；另一个真实红项是 coarse 指针下拆分菜单仍只有 30 高。还有两次先建立其他单元格范围、再悬停合并单元格打开菜单的消费者等待超时，原始动作均保留；从合并单元格原生光标进入菜单的桌面亮暗对照可达，不据此声称所有范围到菜单的切换都已解决。

列宽及批注的两轮前后验证期间，不修改 kernel 契约、服务保存器、原生表格身份扩展或批注实体存储。Surface 仅接入官方工具条按钮；公共 coarse 表格菜单适配补 44 热区与 16 字号，不更换原控件或回调。

## 设计与视觉

正式 [NativeTable 组件](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=199-4529) 在代码接入前登记 Compact／Touch × CellRange／Merged／Split 六个状态。图标使用 BlockNote 自带的 Remix 合并图形；尺寸、颜色、圆角与文字使用已有组件及令牌。[明暗实例](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=199-4530) 已查看，截图与节点清单保存在 `document-table-figma.png`／`document-table-figma.json`。

`document-table-authoring-controls-after.json` 最终 11/11，亮暗 × 1440／390 四组合只读视验。合并按钮实际为桌面 30、coarse 44 热区；拆分菜单项为桌面 30、coarse 44 高，触屏字号实测 16。工具条换行，菜单与工具条均在视口内，规范文稿字节未变，写入、浏览器错误、HTTP 失败与生成均为零。四张合并与四张拆分截图 `document-table-{light,dark}-{1440,390}-{merge,split}.png` 已逐张查看。

首次公共 CSS 候选虽然达到 44 高，字体仍被原生同优先级后加载的菜单规则覆盖为 12；该真实失败保留为 `document-table-authoring-controls-first-css.json`。最终 selector 仅增加实际公开的 `bn-menu-dropdown` 类，沿同一变量取得 16，不使用 `!important`。几何检查通过但格式工具条尚在淡入的记录另保留为 `document-table-authoring-controls-first-geometry.json`；最终截图等待实际菜单及工具条祖先的 opacity 为 1，没有固定延时或产品源调整，也没有重复正文、批注及历史验证。390 使用真实 coarse 条件、鼠标和键盘操作验证控件，不声称已验证操作系统触屏的多单元格选区手势。

各轮消费者的 `cleanup` 均确认浏览器、Studio、私有 workspace、home 与 fixture 已清理。令牌检查通过（39 份样式），`git diff --check` 通过；没有运行测试套件。脚本、原始记录及截图均在忽略的 `.presmium/` 与 `.presmium/ui-evidence/`。

随后公共图片面板验证 `native-file-panel-after.json` 的四个独立文稿顺带实测最终表格菜单字号：桌面 Split 为 30 高／13 字号，coarse 为 44 高／16 字号，四项均通过。该阶段只补表格菜单基础 `pm-text-sm`，没有重跑合并、拆分或批注业务；图片上传验证在同一文稿内保留表格与 3 条批注原值。
