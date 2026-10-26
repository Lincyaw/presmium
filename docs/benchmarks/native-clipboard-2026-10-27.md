# 正文原生剪贴板与快速选区边界

2026-10-27，在独立随机端口 Studio、隔离客户端与私有两页规范文稿上验证。
正常动作间隔的主线 **26/26**；另确认快速选区后剪切可读取旧 ProseMirror 选区，未修复，也没有计入主线通过。
本轮没有修改产品代码。

## 实际操作与主线

使用 Chromium 的实际 Ctrl+C、Ctrl+X、Ctrl+V 与原生方向键选择，没有 dispatch ClipboardEvent，没有以 Clipboard API 写入数据代替复制。
仅为当前私有 origin 授予浏览器剪贴板权限，Clipboard API 用于只读检查真实 text/plain 与 text/html。
原始记录的六个 copy/cut/paste 事件均为 trusted。

文稿包含两页、两段粗体／斜体／链接文本和双项列表，另有两个稳定 Step、各自 Narration 与 Production 停留值；不需要外部素材、插件运行或模型。
主线明确在点击、选区扩展、Enter 与后续剪贴板动作之间采用 50 ms 的观察间隔，不把该间隔加入产品，也不据此宣称快速操作已修复。

| 用户动作 | 真实结果 |
| --- | --- |
| 键盘跨两段选取、复制到第二页 | 两段文字、bold／italic 与链接 href 保留；原页内容与原实体身份不变 |
| 原生撤消／恢复粘贴 | 回到原规范内容，再恢复同一组新生成的身份 |
| 从第一页剪切两段，粘到第二页 | 两段均移动，源页双项列表保留；粘贴的撤消／恢复保持身份 |
| 复制双项列表到第二页 | 仍为一个双项 list；原生撤消／恢复保留该 list 与 item 身份 |
| 刷新后重新打开同一文稿 | native 与磁盘内容、格式、列表和身份一致；刷新实际返回首页后点击重开，没有宣称自动恢复视图 |

`native-clipboard.json` 完整 26/26，10 次真实文稿 POST 全部 200，浏览器异常与 HTTP 失败为 0，始终处于 Doc。
八次 native／磁盘快照均通过实际 kernel validator，没有重复实体 ID。
最终 Steps、Narrations、Production 和 sectionOrder 与初始文稿逐项相等；复制生成新富文本身份，原生 history 恢复这些身份。
比较的是规范内容与身份，不要求 JSON 文件的排版字节不变。
`native-clipboard-final.png` 已实际查看，记录为浅色桌面 1440；本轮没有样式修改或四组合验收。

只读观察器仅在私有客户端副本，读取公开 BlockNote document／selection，原样委托产品注册；没有替换保存、选区或剪贴板处理。
每阶段的规范文稿、原生 JSON、真实 clipboard 内容和事件序列都保留在上述原始记录中。

## 已确认但未修复的快速操作

`native-clipboard-fast-cut-before.json` 保留真实 Studio 失败：DOM 原生选区的 anchor 为 p1、head 为 p2，选中文字是完整两段。
Shift+End 后约 4 ms 执行实际 Ctrl+X，剪贴板与原生编辑器却只剪掉第一段；规范 CAS 如实保存了这个原生结果，第二段仍在原页。
因此不是 rich-text 投影后丢字，也不是 schema 拒绝后只看旧磁盘。该链有 4 次 POST 200，0 浏览器／HTTP 错误，但整体失败。

随后私有消费者在 copy/cut capture 中同时读取 DOM 选区与公开 PM selection，记录 keydown、keyup、selectionchange 及其后 microtask。
公开 core mount 不含 Presmium 适配器或后端，也复现了这一边界：

| core 消费者 | 实际观察 |
| --- | --- |
| 默认配置，首次快速操作 | DOM 两段，PM 仅第一段；只剪第一段 |
| 默认配置，另三次同操作 | 2 次失败、1 次完整剪切 |
| 公开 disableExtensions 关闭 copyToClipboard，首次及另三次 | 本批 4 次完整剪切，但 cut capture 前 PM 均已同步，不能当作修复证明 |
| 默认配置，另加 50 ms 动作间隔 | 完整剪切 |

重复失败的 End keyup 已显示完整两段，但 2／3 ms 后 cut 时 PM 仍为 3→22；成功样本在 cut 前已到 3→40，selectionchange 或 PM 更新先行。
原始记录为 `native-clipboard-core.json` 与 `native-clipboard-core-repeat.json`，其中 complete 仅表示诊断结束，不把失败 case 算作产品通过。
已只读核对 BlockNote 的公开 copyExtension 源码及官方 ProseMirror input.ts：两条 cut 路径都消费 view.state.selection。
关闭扩展样本的前置状态不同，不能据本批结果认定它解决了旧选区，也没有将该选项加入产品。
后续若推进修复，应先找到公开的原生选区／clipboard 同步机制或上游修复，不能凭此改 rich-text、绕过校验或手写 DOM 选区桥。

另一条近零间隔的目标点击→End／Enter→粘贴将内容贴回原页，原生与规范结果一致，保留为 `native-clipboard-fast-target-before.json`。
该条尚未独立隔离焦点与选区的具体调用链，不与已确认的 cut 责任路径合并为一个已证明原因。

## 观察器与范围

最初两份 clipboard 格式断言过窄，分别保留为 `native-clipboard-plain-text-oracle-before.json` 和 `native-clipboard-browser-format-oracle-before.json`。
实际浏览器可能取得 BlockNote 的外部 HTML／Markdown，也可能取得浏览器默认 HTML／裸文本；最终主线依据真实粘贴后的规范文本、marks、链接与列表判断，没有固定一种 MIME 表现。
`native-clipboard-reopen-oracle-before.json` 在完成前 23 项后误等刷新自动回 Doc；最终按照实际首页重新打开。
这些中间记录及图片均保留，没有为观察器改产品。

`native-clipboard-cleanup.json` 确认 8 个私有端口关闭，所有自有浏览器、Studio、home、workspace、fixture 与临时 core 构建已清理。
原始记录、日志与截图位于忽略目录且权限 600，启动 URL 与凭据未输出。
没有操作公共 4320/17407、作者文件或全局客户端构建；没有外部素材读取、付费调用、新 tracked tests 或测试套件。
本轮不覆盖 opaque 教学节点、素材或批注的剪贴板语义，也不宣称所有浏览器或快速交错已通过。
