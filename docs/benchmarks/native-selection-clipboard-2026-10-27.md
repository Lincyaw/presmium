# 快速选区后的受限原生剪贴板

2026-10-27，在私有公开 core 消费者和隔离客户端的真实 Studio 中定位并修复段落、无序列表的快速复制／剪切。
实际产品完成原 26 项主线及 6 项同页补证；新增的 Page 回退观察器先失败，随后单独修正观察方式，完成字面富文本、保存与 history 等 **13/13**。
没有将整轮首份记录改成 complete，也不宣称快速 End→Enter 已修复。
此前正常节奏的记录仍见[原剪贴板验收](native-clipboard-2026-10-27.md)。

## 责任边界

浏览器实际 Shift+End 后，DOM 选区已扩到第二段末尾，公开 ProseMirror selection 仍停在第二段起点。
约 2 ms 后 Ctrl+X，BlockNote 的 copyToClipboard 与关闭该扩展后的 ProseMirror 默认 cut 均读取旧 PM selection。
原生编辑器只剪掉第一段，规范文稿如实保存该结果；不是正文投影、CAS 或磁盘拒绝造成的丢字。

core mount 使用 BlockNote 0.56.0、Tiptap 3.32.0、仓库固定的 ProseMirror view 1.42.6；没有 React、Presmium 投影、保存服务或模拟宿主。
原生键盘事件由真实浏览器产生，没有 dispatch ClipboardEvent 或以 Clipboard API 写入代替复制。
Clipboard API 只读真实剪贴板；实际 Ctrl+V 粘到 textarea 检查其内容。

| core 配置 | 实际结果 |
| --- | --- |
| Chromium 156 默认，5 次快速 cut | 5 次均只剪第一段，DOM 完整、PM 未同步；End→cut 为 1.6–1.8 ms |
| Chromium 关闭 copyToClipboard，5 次快速 cut | 5 次仍失败；1.7–2.0 ms，排除“只关闭 BlockNote 扩展即可修复” |
| Chromium 默认，另两次 20 ms 与一次 80 ms 节奏 | 3 次完整；实际 22.2／22.4／84 ms，没有把等待加进产品 |
| Chromium 普通 contenteditable | 同类快速 cut 完整 |
| Firefox 157，同样 14 条诊断 | 14 条完整，快速默认与 PM 路径的 PM 已同步；不是跨浏览器普遍失败 |
| 产品 nativeTextClipboard 扩展，Chromium 5 次快速 cut | 5 次完整；1.6–2.0 ms，cut 时 PM 仍旧，实际浏览器剪贴板与删除范围均完整 |

原始记录为忽略目录 `.presmium/ui-evidence/` 下 `native-selection-chromium.json`、`native-selection-firefox.json`、`native-selection-extension.json`。
前两份的 complete 表示诊断完成，尤其 Chromium 的失败没有算作通过。
这些是实际浏览器 trusted 快捷键，不是物理键盘或系统输入法验收。

已核对公开 [Selection API 的 selectionchange 排队规则](https://w3c.github.io/selection-api/#selectionchange-event)、BlockNote 0.56.0 的公开 copyExtension 与官方 ProseMirror 源码。
官方 registry 当时最新 1.42.8 的 input.ts 与固定 1.42.6 相同，未找到公开的通用 DOM→PM 强制同步入口。
版本与 API 核对保存在 `native-selection-upstream-version.json`、`native-selection-upstream-api.json`。
没有升级、补丁、私有 domObserver 调用或依赖内部路径；保留真实中文输入已验证的 1.42.6。

## 产品机制及保护范围

`document-editor/clipboard.ts` 用公开 createExtension、Tiptap Extension 与 PM Plugin，明确 priority 1000，先于默认 clipboard handler 判断。
仅当非折叠的单个 DOM Range 全在当前 editor 内、涉及的原生块全部为 paragraph 或 bulletListItem，且不相交 custom inline、批注标记或不可编辑节点时，copy／可编辑 cut 返回 true 而不 preventDefault。
浏览器直接处理其当前原生选区；DOM 读取仅用于允许类型判断，没有换算 PM 位置或写回选区。

Page、opaque 教学块、图片、表格、其它列表／块种类以及受保护 inline／批注仍落到原有 BlockNote handler。
跨页粘贴主线指把普通段落从一页粘到另一页，不等于允许选区跨过 Page 边界。

实际产品的事件冒泡观察确认：

- 普通两段：gate 条件为 true，defaultPrevented 为 false，handler 未写剪贴板 MIME，随后由浏览器完成。
- Page 标题：gate 条件为 false，defaultPrevented 为 true，原 handler 写入 blocknote/html、text/html、text/plain。

私有早期全量浏览器 fallback 会改变 Page 语义、表格 header 的显式 marks 及批注样式，因此没有全局替换。
先前五类保护实验为 `native-selection-sensitive-gated.json`；这是私有实验，不冒充产品全负例矩阵。
该记录有一次既有图片复制的 `/assets/picture.svg` 404；默认路径也出现，未独立隔离原因，本次没有修复或改成零 HTTP。
另一个默认批注复制会扩展原 thread anchor，也保留为既有边界；产品保护分支没有更改该 handler。

## 富文本与字面 Markdown

只改成 HTML 优先仍会运行 Tiptap 的 mark paste rules，把作者字面 `**字面**` 与反引号再解释为 marks。
`native-selection-literal.json` 的两份真实失败保留：默认粘贴优先 Markdown 时还会把字面 `# 标题` 转 heading，并丢实际粗体与链接。

产品在 documentEditorSchema 中通过公开 mark.extend，仅清除 bold、italic、strike、code 的 addPasteRules；保留 input rules、parse／render 与其它 styles。
Surface 的普通富文本粘贴使用公开 `defaultPasteHandler({ prioritizeMarkdownOverHTML: false })`。
没有使用 `_tiptapOptions.enablePasteRules` 等内部配置，也没有伪造 BlockNote MIME 或 PM slice 属性。
commentEditorSchema 没有改动。

公开 core 配置验证 `native-selection-literal-styles.json` **11/11**：

- 原生 HTML 中 `# 标题`、`**字面**`、字面反引号与实际 BOLD／链接一起复制粘贴，文字与 marks 保真。
- 四种样式的原生键入 input rules 仍生效。
- textarea 实际复制出的纯 text/plain Markdown 仍由原解析路径得到 heading 与 bold，没有取消显式纯 Markdown 粘贴。
- copy／paste 事件均为 trusted，浏览器异常与 HTTP 失败为 0。

## 实际 Studio 保存与原生 history

使用两个私有规范文稿、真实 workspace 服务、单个正文 BlockNote 和实际 CAS；观察器只在隔离客户端中读取公开 selection／document 并原样委托注册。
产品模式没有 view.setProps 实验覆盖。源文件 SHA 将 clipboard、schema、Surface 三者绑定在实际运行记录中；两次产品运行完全相同。

首份 `native-selection-product-capture-oracle-before.json` 前 **32 项通过**：

- 原 26 项：跨段复制／剪切到另一页，bold／italic／链接，双项无序列表，原生 Undo／Redo、保存后重开；规范实体 ID 唯一、kernel validator 合法，Step／Narration／Production 绑定不漂移。
- 另 6 项：同页粘贴及原生 Undo／Redo 精确恢复，包括恢复同一组生成的 ID，再用原生 Undo 回基线。
- 四个 source copy／cut 事件均在 Shift+End keyup 后约 2 ms；段落的 PM 为 10→29，列表甚至仍折叠 14→14，DOM 均已覆盖完整选区，实际复制／剪切及磁盘内容仍完整。
- 14 次真实 document/change 全部 200，0 浏览器异常、0 HTTP 失败，始终是 Doc。

第 33 项新增 Page 回退观察失败：capture listener 中的 microtask 过早读取 defaultPrevented，不能据它判定原 handler 未执行。
原 JSON、截图和 complete=false 保留，没有将该份整体算为通过，也没有为观察器改产品。

随后只补必要观察与字面格式链，没有重复前 32 项：`native-selection-product-format.json` **13/13 complete**。
事件改在 document bubble 后记录，确认上述 paragraph／Page 分支；字面三段与实际 bold／link 均保存到 canonical，原生 Undo 恢复精确初始文稿、Redo 恢复同一组身份，reload 后仍一致。
3 次真实 POST 全部 200，0 浏览器异常、0 HTTP 失败。
两次产品运行的实际截图已查看；本次不改视觉样式，没有将浅色 1440 的结果冒充四显示组合验收。

## 检查、清理和未覆盖

轻量类型检查通过 1175 个文件，分层检查与 diff 检查通过；没有新 tracked tests、测试套件、模型或付费调用。
没有操作公共 4320／17407、作者文稿或全局客户端构建。
日志、脚本、原始 JSON 与截图仅留在忽略目录，权限 600，完整启动 URL 与凭据没有输出。

`native-selection-cleanup.json` 确认 18 个已记录私有端口关闭、各消费者的临时浏览器／Studio／home／workspace／fixture 清理成功。
任务私有 Firefox 下载、一份 RPM 与其解包库已删除，metadata 已删，没有自有 Firefox 进程；没有改系统包、通用配置或全局浏览器缓存。

修复只覆盖已验普通段落与无序列表 copy／cut；有序列表、heading 等未开放到快速分支。
快速 End→Enter、目标点击后立即 Enter／粘贴、受保护节点旧 PM 选区、其它浏览器上的产品适配与任意富文本组合仍没有据此宣布通过。
