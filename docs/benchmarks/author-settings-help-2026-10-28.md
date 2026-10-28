# 作者看到的设置与帮助

2026-10-28，在分支 `work/author-settings-2026-10-28`（基于 main `d648346c`）上从源码启动 Studio：`node packages/studio/bin/presmium-studio.mjs <工作区> --port 4336 --host 127.0.0.1`，工作区由 `examples/animations/try.mjs` 新准备。`XDG_STATE_HOME` 指向临时目录，DeepSeek Harness 的 `DSH_HOME`（profile、设置、会话）因此是全新的，没有读写用户自己的 `~/.local/state/presmium/studio`。浏览器为 Playwright Chromium，没有配置模型。

## 设置

改动前（同一全新状态）：通用设置有权限（工作区内修改）、语言、外观、字号、工作细节（详细）、何时折叠工作细节、显示代码工作视图（**开**）、快捷键、忙碌时的发送方式、性能与用量（详细），头部有“打开配置文件”；导航有通用设置、模型、内置插件、Agent 预设。

改动后：

| 项 | 做法 | 结果 |
| --- | --- | --- |
| 显示代码工作视图 | 客户端经 `ctx.configForms.get('ui-settings').set('enabled', false)` 写进 profile 补丁层，只在作者没选过时写 | 全新状态首次打开后 profile 补丁出现 `ui-settings.enabled: false`；开关为关 |
| 工作细节、性能与用量 | 同上，`ui-chat.transcriptView: compact`、`performanceUsage: compact` | 打开代码工作视图后显示“Compact”“On completion” |
| 权限、工作细节、何时折叠、忙碌时发送方式、性能与用量 | 代码工作视图关着时，用同 ID、优先级 -1 的空单元遮蔽 `settings.general.item` 中的 `permission`、`transcript-view`、`composer-enter`、`performance-usage` | 关：都不显示；打开开关：五行全部回来；再关：又消失 |
| 内置插件、Agent 预设 | `web.patch.yml` 关掉 `ui-settings-plugins`、`ui-agent-preset` | 导航只剩“通用设置／General”“模型／Models”；对话输入区不再有预设选择 |
| 语言、外观、字号、快捷键、模型 | 不动 | 保留 |

第一版把默认值放进 `web.patch.yml`（`--patch`）。实测打开代码工作视图时出现“Could not save. Please try again.”：命令行补丁高于 profile 层，设置表单拒绝会被它覆盖的写入。因此改为在 profile 层写入作者没选过的字段，作者之后的选择照常保存。

同 ID 遮蔽对 `settings.section` 不可用：设置导航直接列出全部条目，实测多出两个空白导航项，所以这两页按行关掉，打开代码工作视图也不会回来。

四种组合（亮色 1440 英文、暗色 1440 中文、亮色 390 中文、暗色 390 英文）各自打开设置与帮助并截图，内容一致：通用设置为语言、外观、字号、显示代码工作视图、快捷键与当前版本，导航两项；页面没有报错。

## 帮助

先在真实工作台中逐项操作“功能导览 01”，再改写帮助。旧文中不成立的说法：

| 旧说法 | 现状 |
| --- | --- |
| 单击内容或选中文字出现“编辑文字、新建批注、AI 改写”工具条 | 选中文字出现 BlockNote 的格式工具条：段落、加粗、斜体、下划线、删除线、代码标记、对齐、颜色、嵌套、添加链接、添加评论；单击没有工具条。`rewriteEdit` 等文本仍在 `packages/workbench/src/messages.ts`，界面中没有使用 |
| 双击文字直接修改，Enter 保存、Esc 取消 | 直接在正文中输入；自动保存，工具栏显示“Saved · just now／已保存” |
| 命令栏的“发送批注给 AI” | 不存在；“批注 (n)”面板只列出批注 |
| “查看”模式 | 不存在；有“放映预览” |

已核对、写入新帮助的操作：输入后显示“已保存”；Ctrl+Z 撤回刚输入的文字、Ctrl+Y 重做；“添加评论”打开评论框，保存后在“批注 (1)”中列出；鼠标移到段落上出现“添加块”（标题、列表、表格、图片等）与“打开菜单”（删除、颜色）；页面“…”菜单为重命名、复制页面、上移、下移、删除页面；“版本历史”每条带“撤消此更改”；“放映预览”显示 1 / 11 的幻灯片；“导出”有网站、幻灯片网站、Notebook、幻灯片 PDF、幻灯片图片、幻灯片 PowerPoint；“AI 助手”打开对话，当前文稿经 `/api/presmium/context` 交给会话；模型在“设置”的“模型”中设置。中英文按钮名称分别从中文与英文界面读出。

## AI 助手

关掉 `ui-agent-preset` 后，在对话中发送一句话：会话建立，会话记录中 `agentPreset` 为 `authoring`，人设为 Presmium 的作者助手；因为没有模型，这一轮以 `MISSING_CREDENTIAL` 失败。窄屏下对话占满页面，输入区可用。“更多”中的“插件”页（`ui-plugin-manager`）仍可打开。

## 没有改动的项

- 设置头部的“打开配置文件”：`ui-settings-general` 在回环地址上自带，没有配置项或槽位可以关掉；只能用 CSS 隐藏，没有这样做。
- “显示代码工作视图”本身与它的说明文字（“Agent 预设”等）：它是唯一回到技术设置的入口，保留；文字属于 dsh 的语言包。
- 设置对话框在 390 宽度下的拥挤排版来自 dsh。
- 不在本次范围、仍对作者可见：对话输入区的访问模式选择（`ui-permission`，关掉会去掉 6.3 节允许的完全访问模式）；默认语言为“English”而不是“English (Presmium)”时，对话首页标语与输入提示是 dsh 的原文（“Into the Unknown”“Describe what you want to build…”）；缺少模型时显示 dsh 的原始错误；“更多”中的插件页。
- 全新状态第一次打开页面时，作者默认值写入之前，代码工作视图按 dsh 默认短暂为开，技术行可能闪现一次。

运行的检查：`check-types`、`check-layering`、`check-tokens`、`check-skills`、`check-plugins` 均通过。未运行测试套件、e2e 或示例完整构建。
