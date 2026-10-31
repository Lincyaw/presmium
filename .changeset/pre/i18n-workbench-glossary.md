---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
---

The workbench's interface text in zh-CN and en follows the glossary (`docs/glossary.md`).

- `@lincyaw/workbench`: Every catalog is reworded: 撤消, 放弃, 恢复草稿, 还原, 导出 and 导出记录 (no 生成 or Make for exports), 讲稿 and 配音 (no 讲解 or Narration), 结束放映, 需要更新 and 更新 instead of compiling, 待确认 / Pending Approvals (2), “” quotes, one “…”, and no internal names (git, the package, source files, IDs, MCP, the workbench) in author messages. Commands, panes and dialog titles in en are Title Case, messages and fields sentence case, in US English; failures read “无法…” / “Couldn’t …”. The toolbar's Present button is named Present, the document's side panes are labeled by name, and Web is the name of the web view.
- `@lincyaw/workbench`: BlockNote's own menus and tooltips are overridden through its public `dictionary` option in both languages (`document-editor/blocknote-messages.ts`): 批注 / New Comment, 插入内容块 / Insert Block, Word's names for alignment, indent and strikethrough, Title Case table and file commands. Slash-menu search words come from the catalogs and match in either language.
- `@lincyaw/workbench`: `localeOf` is the kernel's; the sortable list takes the workbench's language from its caller instead of reading the page or the browser.
- `@lincyaw/dsh`: The client's catalog follows the same rules (隐藏, 重新加载, 详细信息, New Chat, Get Started). The authoring preset's name is the brand and its one-language description is gone, since the preset picker is off. The error a writing tool returns when the workspace has no version history names Version History instead of git.
