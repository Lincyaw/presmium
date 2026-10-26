# 中文预编辑收缩的依赖回归

2026-10-27，先用 CDP 缩小责任范围，再用独立 Linux/X11/IBus 会话确认。
本仓库固定 ProseMirror view 1.42.6 后，真实 Studio 正文、原生撤消／恢复及字幕字段输入共 **13/13**。
先前 1.42.7 的失败与保存策略结果保留在[原系统输入法记录](document-os-ime-2026-10-27.md)，没有覆盖成通过。

## 版本分界

原生事件显示，拼音 `zhongwen` 的候选从“中哦”缩短为“中”时，BlockNote 的文本节点被替换，后续按键开始第二段组词，最终成为“中顾问”。
纯 textarea 与 contenteditable 得到“中文”，默认 BlockNote React、公开 core mount 及 `animations:false` 均失败。

CDP 诊断重放同一预编辑变化，再继续输入与确认。它不经过系统输入法，因此没有拿其结果作为 OS 验收。

| 私有诊断消费者 | 收缩后的节点／最终文字 |
| --- | --- |
| 默认 BlockNote core；不发按键或另发 Process 按键 | 文本节点替换；“中中文” |
| 原生 contenteditable | 收缩时节点不变；“中文” |
| 公开 ProseMirror schema + EditorView | 收缩时节点不变；“中文” |
| ProseMirror 使用 BlockNote 的公开 schema 与原始 doc | 收缩时节点不变；“中文” |
| 上述 ProseMirror 加公开 inputRules 空规则 | 收缩时节点不变；“中文” |
| BlockNote 公开关闭 18 个非结构默认扩展 | 仍替换节点；“中中文” |
| BlockNote 经公开 view props 移除全部 NodeViews、单独移除 paragraph 或 blockContainer | 三例仍替换节点；“中中文” |

模块图确认上述消费者使用同一 ProseMirror view 1.42.7。
后续只在私有 esbuild 中将公开 `prosemirror-view` 包入口替换为完整发布版本，没有改依赖代码、仓库锁或模块树：

| 私有入口版本 | CDP 收缩后的节点 | CDP 最终文字 |
| --- | --- | --- |
| 1.42.6 | 保持 ID 2 | 中文 |
| 1.42.7 | ID 2 → 3 | 中中文 |
| 1.42.8 | ID 2 → 3 | 中中文 |

两个临时下载来自官方 registry，按发布 metadata 的 SHA-512 校验。
官方 1.42.6 → 1.42.7 的 `src/domchange.ts` 差异新增了 inline 删除时调用 Backspace handler 的路径，与收缩处多出的空事务相符；这是相关源码机制，未通过补丁单独隔离该行。
版本比较与后续实际输入确认支持固定 1.42.6，不把关闭 NodeViews、输入规则或模拟事件作为产品修复。

诊断原始记录为忽略目录 `.presmium/ui-evidence/` 内 `ime-cdp-diagnostic.json`、`ime-cdp-pm-boundary.json`、`ime-cdp-bn-schema-boundary.json`、`ime-cdp-inputrules-boundary.json`、`ime-cdp-disabled-boundary.json`、`ime-cdp-nodeview-boundary.json`、`ime-cdp-pm-versions.json`。
`ime-cdp-module-graph.json` 与 `ime-cdp-official-source-diff.json` 保存模块来源和官方发布源码差异，没有读取依赖的 compiled 源码。
这些记录的 `complete` 表示诊断完成；保留了错误的最终文字，没有算作产品通过。

## 真实系统输入复核

重新建立与原失败相同的私有 Xvfb、DBus、IBus/libpinyin 和 headed Chromium 156/GTK3 环境。
先在公开 core mount 消费者中私有替换为 1.42.6，原 XTEST 参数 `key --clearmodifiers --delay 100 z h o n g w e n` 得到“中文”。
收缩后 KeyN 仍处于 composing，至空格确认前保持同一个文本节点，只有一次 compositionstart；确认结束 21 ms 后才出现正常的节点移除。
实际候选窗首项为“中文”，截图已查看。原始记录为 `os-ime-core-pm1426.json`，截图专用命名 `os-ime-core-pm1426-candidate.png`，没有覆盖旧 control 图。

随后本仓库根 `pnpm-workspace.yaml` 的 overrides 固定 `prosemirror-view: 1.42.6`，更新锁文件。
BlockNote 0.56.0 与 Tiptap 3.32.0 不变，公开入口实际解析到同一个 1.42.6。
真实 Studio 使用普通依赖图与原编辑适配器，**没有 esbuild alias**；只读观察器只存在于其私有客户端副本。

`os-ime-product-pm1426.json` 完整 **13/13**：

- 正文真实拼音预编辑停顿 800 ms，0 POST，磁盘不变；空格确认后原生与规范正文精确为“中文”，605 ms 后发起保存。
- 正文光标位于原 `intro-paragraph`，折叠偏移 2。实际 XTEST Ctrl+Z／Ctrl+Shift+Z 撤消与恢复，原生内容、规范磁盘与稳定段落身份一致。
- 打开“字幕”，在单个原生字段中实际输入相同拼音；预编辑停顿 800 ms 不创建 Narration、不提交，确认 605 ms 后仅创建一个“中文” Narration。
- 字幕字段的实际 ShadowRoot 选区折叠于“中文”偏移 2，正文仍为“中文”；整个过程保持 Doc 与单个正文 BlockNote。
- 共 4 次真实规范文稿 POST，全部 200；浏览器异常与 HTTP 失败均为 0。

依赖、锁和保存 actor 的实际 SHA 另见 `os-ime-product-pm1426-dependencies.json`。
本环境的 compositionstart/update 与组词 input 为 trusted；compositionend 的标志仍与标准 textarea 对照一样为 false，没有修改标志或改用合成事件。

## 观察器失败与清理

产品主链的三个中间观察器失败独立保留，没有算作通过：

| 原始记录后缀 | 原因与最终观察方式 |
| --- | --- |
| `undo-oracle-before` | 空段落 innerText 为换行，原断言要求空串；native content 和 canonical children 实际均为空。最终读取 textContent 与规范内容，记录 trailingBreak。 |
| `old-caption-label` | 观察器沿用旧按钮名称；最终点击当前实际“字幕”入口。 |
| `shadow-selection-oracle-before` | document.getSelection 返回 ShadowRoot host 外的边界；最终从字段实际 root 只读获取选区。 |

三份记录均以 `os-ime-product-pm1426-` 开头，原 JSON 和截图保留，没有为修正观察器修改产品。
另一个 inputRules 诊断最初因 pnpm resolver 上下文未解析到公开依赖而未启动；失败独立留在 `ime-cdp-inputrules-resolve-before.json`，不算编辑器失败。

`os-ime-pm1426-final-cleanup.json` 全部清理项为真：49 个临时 RPM、解包运行环境、私有版本包、profile、Xauthority 与 metadata 已删除；浏览器、Studio、Xvfb、IBus、DBus namespace 均已结束，13 个相关私有端口关闭，没有残留自有进程或 namespace。
脚本、日志、JSON 和截图只留在忽略目录并设为 600。没有全局系统包安装、公共 4320/17407 操作、作者文稿写入、全局客户端构建、模型或付费调用、新 tracked tests 或测试套件。

## 适用边界

固定版本目前只由本仓库根 overrides 与锁文件保障。发布包的外部消费者不会自动继承根 overrides，仍需独立的依赖约束与真实安装验证，不能据此宣布外部安装已修复。
实际系统输入只覆盖当前 Linux/X11/IBus/Chromium 配置下的这一词语与短主链，没有覆盖其它系统、输入法、浏览器、组词中途卸载或所有中文字词。
