# 原生批注长文本的换行与边界

BlockNote 浮动新批注输入连续标识符后，原生线程会按内容撑宽并被浮层隐藏。固定 `85c38417fc36ec9f846cfec48e2034f19c578837` 的独立 Studio 中，3,211 字符输入得到 30,430.77px 宽、`visibility:hidden`；Save 不可见。这是原生排版的真实反例，不是提交失败或草稿归属问题。

修复只在 `@lincyaw/design` 的公共 BlockNote 适配与令牌：线程宽度取 `--pm-comment-width:22rem`、视口与父容器上限，长 URL、标识符和中英连续文本使用 `overflow-wrap:anywhere`。原生 Comments.Editor 以 `--pm-comment-editor-max-height:18rem` 与 `45vh` 中较小者限制高度并独立滚动；Save 保持在原生编辑器之外。原生回调、选区、评论内容、草稿与 canonical 提交边界不变，没有业务 CSS、依赖补丁或新按钮。

Figma 公共 [NativeComments](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=269-5405) 登记 Compact／Touch，复用现有无图标 Save 按钮、产品颜色／文字／浮层样式及两个新增尺寸变量；[亮暗检查帧](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=269-5406) 已实际查看。原 I01 草稿恢复节点与新建评论 lane 未修改。

## 实际验证

忽略证据位于本 worktree 的 `.presmium/native-comment-wrap/`，原 raw 均保留。

| raw | 范围 |
|---|---|
| `before-1793142636802/result.json`，2/2 | 真实浏览器以正文原生键盘选区打开 Add comment，输入 3,211 字符；记录撑宽与隐藏反例及零模型／错误。计数是观察器断言通过，不是产品正确 |
| `after-1793142671092/result.json`，complete:false，12 项已过 | 两种桌面主题各三种文本输入／保存通过；缩至 390 后，既有导航窗格仍开启并拦截正文点击。未绕过指针命中或为此改产品 |
| `after-1793142729795/result.json`，complete:false，12 项已过 | 观察器使用错误的导航关闭标签而停止。改为实际公开按钮名称；源码未变 |
| `after-1793142775424/result.json`，25/25 | 四组合各三种文本，原生 Save 可达；重复 payload 的磁盘 includes 不能单独证明后续新增提交，本轮不作为最终保存 oracle |
| `after-strong-1793142868482/result.json`，26/26 | 浅／暗 × 1440／390，每组合唯一的长标识符、URL、中英连续文本，共 12 次原生提交。每次断言新线程数精确加一、canonical 含本次完整唯一文本，再等待实际 `data-save=saved` ACK；线程均宽 352px、输入有界竖滚且 Save 可点击。最后暗色 390 原生侧栏的 12 个已保存线程均无横向溢出 |

最终四幅浮层截图及暗色窄侧栏截图已逐幅查看，正文背景的模板标题占位符属于这份临时 fixture，不是本次产品修改。四组合是实际 Chromium 主题／视口验证，不等同物理触屏或新增 coarse-pointer 验收；本片未验证独立的长作者 ID、所有短屏高度、长代码块或任意插件内嵌内容。

最终六个观测运行源的起止与当前 SHA 一致，其中仅两个公共 CSS 文件改动。所有消费者的浏览器、私有 Studio 前后端、任务目录和临时文稿均已清理；没有公共端口动作、模型、ASR／TTS、外网请求或新 tracked tests。类型、令牌、分层、技能与包结构轻检见 `.presmium/native-comment-wrap/final-manifest.json`。未运行套件、全量示例或与评论排版无关的旅程。
