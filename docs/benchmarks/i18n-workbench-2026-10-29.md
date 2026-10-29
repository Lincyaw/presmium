# 工作台界面文本按术语规范修正（zh-CN 与 en）

日期：2026-10-29。分支 `work/i18n-workbench-2026-10-29`。依据：[界面术语与文案规范](../glossary.md)、[界面文本审计](i18n-audit-2026-10-29.md) 第二阶段的第 1 片（工作台）。范围：`packages/workbench/src/**`、`packages/dsh/src/client/**`、`packages/dsh/src/node/turns.ts`、`packages/dsh/web.patch.yml`、`packages/dsh/profile.patch.yml`（后者没有给作者看的标签，未改）。

## 改了什么

- **目录改词与写法**：工作台的全部目录（`messages.ts`、`*-messages.ts`、`document-editor/messages.ts`、`StepProductionEditor.tsx`、`narration-schema.tsx`、`sortable-list.tsx`、`schema-form/context.ts`）与 dsh 客户端目录按规范第 2–8 节改写：撤消、放弃、恢复草稿、还原、重新加载、显示 / 隐藏、详细信息；导出与导出记录取代生成与生成记录；讲稿与配音取代讲解、旁白、Narration；结束放映；“正在准备放映…”“需要更新”“更新”取代编译；“待确认 2 / Pending Approvals (2)”；“”引号与单个“…”；失败消息以“无法…”“Couldn’t …”开头。作者消息中不再出现 git、`@lincyaw/dsh`、插件包、源码、源文件、页面 ID、MCP、工作台。
- **大小写**：en 的命令、窗格、视图、对话框标题改为 Title Case（`New Document`、`Make a Copy`、`More Actions for “…”`、`Close Navigation Pane`、`Duplicate Page`、`Undo This Change`、`Use Inherited Timing`、`Set Caption Times`、`New Chat`、`Get Started`、`Set Up a Model`、`Video Production`、`Version History`、`Export History`）；消息、字段、选项与状态保留 sentence case。美式拼写（`Canceled`、`Canceling`）。
- **BlockNote 自带文本**：新增 `document-editor/blocknote-messages.ts`，经 BlockNote 公开的 `dictionary` 选项在两种语言中覆盖与规范冲突的条目，`BlockNoteSurface.tsx` 与 `NarrationEditor.tsx` 都用它：批注 / New Comment、插入内容块 / Insert Block、打开内容块菜单 / Open Block Menu、插入链接 / Insert Link、Word 的对齐、缩进与删除线名称、表格与文件命令的 Title Case、“…”、基本内容块分组名（原 zh 词典中“基本块”与“基础”不一致，引用块会单独成组）。
- **其他界面修正**：工具栏的放映按钮名称为“放映 / Present”（原为“放映预览”）；文稿侧栏区域的无障碍名称来自目录（原为 `export`、`history` 等内部标识）；视图菜单中网页版式叫“网页 / Web”；斜杠菜单的搜索别名移入目录，两种语言的词都能搜到。
- **语言选择**：工作台的 `localeOf` 改为引用 `@lincyaw/kernel` 的实现；`PmSortableList` 不再自己读 `<html lang>` 与 `navigator.language`，`locale` 改为必填，由调用方传入工作台状态中的语言。dsh 的 `workbenchLocale` 是工作台语言的唯一来源（设置中的语言，未选择时看浏览器语言），保留。
- **单一语言的预设**：`web.patch.yml` 中“创作”预设的名称与说明只有中文。预设选择器（`ui-agent-preset`）已关闭，作者看不到预设名，所以名称改为品牌 `Presmium`，去掉只有中文的说明（规范没有为预设名定词，选择“改为不显示”）。
- **到达 AI 与作者的错误**：`turns.ts` 在工作区没有版本历史时给写入工具的错误不再写 git 与 `git init`，改为说明“版本历史”未开启、请作者让管理员开启。这段文字由 AI 读取后用作者的语言转述，保持英文。

## 检查脚本（`node scripts/check-i18n.mjs --package <包>`）

| 包 | A | B | C | D | E | F | 合计 |
|---|---|---|---|---|---|---|---|
| workbench 修正前 | 0 | 0 | 399 | 6 | 4 | 4 | 413 |
| workbench 修正后 | 0 | 0 | 93 | 0 | 4 | 0 | 97 |
| dsh 修正前 | 0 | 0 | 41 | 6 | 12 | 2 | 61 |
| dsh 修正后 | 0 | 0 | 1 | 4 | 10 | 1 | 16 |

workbench 修正后的 C 类 93 条：

- 81 条是脚本直接读取的 BlockNote 原始词典（`@blocknote/core/locales`），不是界面实际使用的词典。把脚本的 BlockNote 一节换成读取 `blockNoteDictionary()` 合并后的结果再运行（脚本副本，未提交），这一部分为 0。
- 12 条是误报，逐条判断：
  - 字段标签、占位文字与选项，按规范第 3 节用 sentence case：`Search documents`、`Search assets`、`Find a voice`（搜索框标签）、`Choose a draft`（两处，选择框的占位）、`Replace independent settings`（分段控件的选项）、`Show resolved comments`（开关）。
  - 状态词：`Export failed`。
  - 写进文稿的内容：`New page`（新页面的默认标题，按文稿 `lang`）。
  - “用 AI 改写”中包含被禁用的“AI 改写”（两条），规范要求的写法本身触发了子串匹配。
  - “火山引擎”是品牌名（Volcengine），不是“引擎”这个词。

workbench 的 E 类 4 条（`context.tsx:16`、`preview-pool.ts:93`、`preview-pool.ts:124`、`workspace-client.ts:454`）是开发者错误与内部拒绝原因，不直接显示给作者。

dsh 修正后的 16 条：C 1 条是占位文字 `Open a document first`（sentence case，误报）；D 中 `brand.tsx` 两条是品牌名 Presmium，`index.tsx:63` 是 `ctx.effect` 的调试名称，`node/fake-model.ts:59` 是测试用假模型的回复（不在本片的文件范围内）；F 1 条是工作台语言的唯一来源（见上）；E 10 条是日志、启动错误与内部协议错误，作者看不到，`turns.ts` 中原先会到达 AI 与作者的那条已改写。

另运行：`check-types`（通过，1369 个文件）、`check-tokens`、`check-layering`、`check-skills`、`check-packages`，均通过。没有运行测试套件。

## 真实运行

从工作树启动 Presmium Studio：`node examples/animations/try.mjs <临时目录>` 准备示例副本，`XDG_STATE_HOME=<临时目录>/state node packages/studio/bin/presmium-studio.mjs <副本> --port 4353 --host 127.0.0.1`。修正前（把改动暂存后用同一分支的原代码）与修正后各用全新的示例副本与状态目录跑一次。用 Playwright Chromium（1440×900 亮色，另加 390×844）先用英文、再经“设置 → 语言”切到“简体中文（Presmium）”走同一组界面，每屏截图并取出页面的可见文字与 `aria-label`、`title`、`placeholder`：

首次欢迎、首页文稿列表、搜索无结果的空状态、文稿的“更多”菜单、帮助、设置（常规、模型）、打开文稿“功能导览 09”、工具栏与逐个按钮的工具提示、格式工具栏与逐个按钮的工具提示、颜色菜单、新建批注、斜杠菜单、内容块菜单与其颜色子菜单、表格菜单、批注窗格、版本历史、导出、字幕侧栏、页面菜单、放映、视频制作、未设置模型时的 AI 助手卡片；390 宽度下的文稿与首页。共 53 屏，截图保存在本地临时目录，未提交。

对每屏的文字计数（文稿正文、页面标题等文稿内容不计）：

| 检查 | 修正前 | 修正后 |
|---|---|---|
| en 中的汉字 | 1 | 1 |
| zh-CN 中整句英文 | 0 | 0 |
| 规范“不用”一列的词与内部名称（en） | 21 | 5 |
| 规范“不用”一列的词与内部名称（zh-CN） | 23 | 4 |
| en 中以命令动词开头却不是 Title Case 的短语（与脚本同一启发式） | 39 | 9 |

修正后剩下的：

- en 中的汉字 1 条：视频制作时间线上显示的讲稿片段（文稿内容，两句拼在一起，没能与文稿原文匹配上），误报。
- “不用”的词 en 5 条、zh-CN 4 条，全部来自 DeepSeek Harness 自带的设置页：字号说明 `Only affects conversation content`、`Show coding view` 的说明 `Shows trajectory, code diffs, and all Agent presets` 与中文“……完整的 Agent 预设切换”、模型设置中的 `Model ID 1`、`Model ID`、`Model ID 2`（“模型 ID”）。
- Title Case 9 条：Harness 的 `Open configuration file`、`Show coding view`、`Edit shortcuts`、`Add model provider`、`Delete model`（三处）；`Search documents` 是搜索框标签（sentence case 正确）；`Export Slides as pictures` 中的 `Slides as pictures` 是 `render-slides` 提供的导出目标名称，不在本片范围。

## 没有做的

- **Harness 自带的界面文字**：`vendor/docs/dsh` 只说明了 `ctx.locale.register(ns, locale, dict)` 与 `addLanguage` 的用法，没有列出各命名空间的键名；上面列出的设置页文字（`Show coding view` 及说明、`Only affects conversation content`、`Open configuration file`、`Edit shortcuts`、`Keyboard shortcuts` 一行、`Add model provider`、`Delete model`、`Model ID`）以及侧栏的 `Search sessions`、`Add workspace`、`New session in …`、对话输入区的 `Add files or run commands`、`Access mode, current: Workspace Write`、`Select model` 的键只能从 Harness 的构建产物中找到，按要求未覆盖。
- **待确认的弹出框**：只有外部 AI 工具发来待允许的请求时才出现，本次运行没有触发；它的文字（“待确认 2 / Pending Approvals (2)”“待确认的操作 / Pending Approvals”“允许 / 拒绝”）只在目录中核对。
- **拼接服务端原因的消息**：`saveFailed(reason)`、`previewFailed(reason)`、`askFailed(reason)`、`fixFailed(reason)`、`focusFailed(reason)` 与 `cloneFailure` 在没有对应目录条目时直接显示服务端或浏览器给出的原因文字，可能是英文；需要逐个追到来源再改为目录文本。
- **讲稿中的提示标签**：视频制作的讲稿编辑器把提示显示为“Cue · pause”，其中 `pause` 是文稿数据中的动作名，`title` 是提示的标识；需要为提示动作建立显示名称。
- **重做的快捷键**：工具栏写“恢复（Ctrl+Y）”，Harness 的快捷键提示写 `⌘/Ctrl+Shift+Z`，两处不一致。
