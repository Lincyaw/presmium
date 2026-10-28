# 表格表头：行列手柄菜单中的“行标题”“列标题”

2026-10-28。文档编辑器用自定义的表格行列手柄菜单（`DocumentTableHandle`）换掉 BlockNote 的默认菜单后，菜单中只剩删除、添加与颜色，表头开关只能从块手柄菜单找到；作者在表格旁边找不到“把第一行设为表头”。同时发现读写不一致：查看器把没有 `headerRows` 的表格当作有一行表头（与 Markdown 相同），而编辑器读入时当作没有表头，关闭表头保存时又直接省略该字段，结果在编辑器里关掉的表头在预览中仍是 `<th>`。

## 改动

- `authoring.tsx`：行列手柄菜单在第一行的手柄上显示“行标题”，在第一列的手柄上显示“列标题”，带勾选状态，文字来自 BlockNote 的词典（中文“行标题”“列标题”，英文 “Header row”“Header column”）。BlockNote 自己的 `TableHeaderRowButton` 不在公开导出中，因此按它的行为用公开的 `useComponentsContext`、`useExtensionState(TableHandlesExtension)` 与 `editor.updateBlock` 组合；只在 `tables.headers` 打开时出现，每个方向最多一行／一列表头，与 BlockNote 相同。块手柄菜单中的两项保留。
- `rich-text.ts`：文稿 IR 已有 `TableNode.headerRows`／`headerColumns`（`packages/kernel/src/contracts/document.ts`），不改契约。读入时没有 `headerRows` 的表格按查看器的规则显示一行表头；保存时关闭的表头写成 `headerRows: 0`，原本没有该字段且仍是默认一行时不补写，避免未改动的表格产生差异。`headerColumns` 的默认值在两端都是 0，保持省略。

## 验证

用 `examples/animations/try.mjs` 准备独立的临时工作区，从本分支启动 `presmium-studio`，端口 4344。机器上的 Studio 默认共用 `~/.local/state/presmium/studio` 下的配置，其中 `@lincyaw/dsh` 的软链接会被同时运行的其他工作树改指过去（第一次启动时页面加载的正是另一工作树的客户端），所以本次以独立的 `XDG_STATE_HOME` 重启后再测。浏览器为 Playwright Chromium，中文界面，文稿“功能导览 09：动手编辑一份讲义”中的价格表（`budget-price-table`，4 行 2 列，原有 `headerRows: 1`）。“编辑器 th”为编辑区表格中 `<th>` 的数量，“预览”为放映预览中查看器框架里的表格结构。

| 步骤 | `lecture.json` | 编辑器 th | 预览 |
|---|---|---|---|
| 打开 | `headerRows: 1` | 2 | — |
| 第一行手柄菜单 | 删除行、上方添加行、下方添加行、**行标题 ✓**、颜色 | | |
| 取消“行标题” | `headerRows: 0` | 0 | — |
| 刷新后重新打开 | `headerRows: 0` | 0 | — |
| 勾选“行标题” | `headerRows: 1` | 2 | — |
| 第一列手柄菜单 → 勾选“列标题” | `headerRows: 1, headerColumns: 1` | 5 | — |
| 刷新后重新打开 | 同上 | 5 | `thead` 1，其中 `th` 2；`tbody` 中行标题 `th` 3；`td` 3 |
| 取消行标题与列标题 | `headerRows: 0`，无 `headerColumns` | 0 | 无 `thead`，`th` 0，`td` 8 |
| 在文件中删除 `headerRows`、`headerColumns` 后重新打开 | 无 `headerRows` | 2（与查看器一致） | — |
| 再勾选“列标题” | 仍无 `headerRows`，`headerColumns: 1` | 5 | `thead` 1／`th` 2，`tbody` 中 `th` 3，`td` 3 |

第一次启动误用另一工作树（未含本改动）的客户端时，同一操作下第一行手柄菜单只有“删除行、上方添加行、下方添加行、颜色”四项，即修改前的状态。

亮色与暗色、1440 × 900 与 390 × 844 四种组合下打开第一行手柄菜单并截图查看：菜单五项，“行标题”在 1440 下位于 533, 585（84 × 30），390 下位于 117, 471，菜单整体在视口内，勾选标记、文字与菜单的颜色、边框和阴影沿用 BlockNote 菜单已有的令牌，暗色下对比正常；编辑区表头单元格加粗显示。放映预览的截图停在第 1 页（表格在第 2 页，翻页按键没有作用到预览框架），上表中的预览结构取自查看器框架的 DOM，没有单独的预览截图。

`node scripts/check-types.mjs`、`check-tokens.mjs`、`check-layering.mjs` 通过。没有新增测试，没有运行测试套件，没有在 Firefox／WebKit 中检查。
