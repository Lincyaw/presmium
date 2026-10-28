# 原生批注工具栏的可访问名称

2026-10-28，工作树 `comment-toolbar-accessibility`，基线 `68031783803dd9df1bc5b8ed77df3906a7f06641`。
运行改动提交为 `c0ef4d12cb74a8665c99ffcf063ec9ac3c710964`。

## 改动边界

BlockNote 0.56.0 的原生批注更多操作按钮传入本地化 `mainTooltip`，没有传入 `label`。
原 Mantine 组件通过 `label` 提供 `aria-label`，因此原按钮能用指针打开，但不能按角色与名称找到。
工作台在原 `ComponentsContext` 的 `Generic.Toolbar.Button` 中保留显式名称，缺少时复用 Tooltip 文案。
两者都没有时不注入空名称。
原 props、ref、菜单与原生编辑器行为继续透传，没有新增可见文案、样式或交互内核。

接口依据为固定版本的官方 [ComponentsContext](https://github.com/TypeCellOS/BlockNote/blob/v0.56.0/packages/react/src/editor/ComponentsContext.tsx)、[Comment](https://github.com/TypeCellOS/BlockNote/blob/v0.56.0/packages/react/src/components/Comments/Comment.tsx) 与 [Mantine ToolbarButton](https://github.com/TypeCellOS/BlockNote/blob/v0.56.0/packages/mantine/src/toolbar/ToolbarButton.tsx)。
产品只从依赖公开入口导入，没有修改依赖源码或使用内部导入路径。

## 实际运行

原始材料位于 ignored 目录 `.presmium/comment-toolbar-accessibility/`。

| 记录 | 结果 | 实际范围 |
| --- | --- | --- |
| `before-1793161904020/result.json` | 保留失败 | 观察器误用 `moreActions` 大小写，不能作为产品结论 |
| `before-1793161970668/result.json` | 2/2 | 原按钮有 Tooltip 观察标识，但没有可访问名称；这是缺陷反例 |
| `after-1793162006381/result.json` | 6 项通过后未完成 | 桌面操作通过；观察器在窄屏尝试点击已被侧栏覆盖的正文锚点 |
| `after-1793162094805/result.json` | 13/13 | 明暗 1440／390 四组合的精确名称、原生菜单、编辑、输入及取消 |

名称消费者在每个组合通过角色与精确名称 `More actions` 找到按钮，打开原菜单并选择 `Edit comment`。
它输入一段未提交文字，再点击原生 Cancel，核对规范文稿字节未改变。
桌面按钮实际为 30 × 30，粗指针窄屏为 44 × 44。
英文名称已实际验证；其他语言复用 BlockNote 的原字典，此轮没有独立验证所有语言。

每轮均记录 1195 个 package 源、package 清单及根清单／lock 文件，起止一致。
最终 13 项的 1195 个 SHA 与当前文件全部相同。
旧轮次只在改动的 `BlockNoteSurface.tsx` 与最终字节不同，没有将其冒称为最终源码验收。
最终运行源码 SHA-256 为 `d251e2fe4fbda6bddcffaac2f0bc8dd5089ce6d1d484fcefd36f2405a9933cf5`。

最终 raw SHA-256 为 `e8a2e3f7edf457df8a96dfdc4451ec311dea9a64201c20b31d9b17f6a186b172`。
13 项的四张截图已实际查看，其中窄屏有横向偏移，因此该轮只证明名称与原生菜单操作，不能作为视觉验收。

## 窄屏偏移的独立诊断

根集成后的两张 390px 图同样出现偏移。以下材料没有改动产品源码、样式或焦点逻辑：

| 记录 | 结果 | 实际范围 |
| --- | --- | --- |
| `probe-1793162391476/result.json` | 7/7 观察完成 | 明暗窄屏在截图前已经横滚；普通、fullPage、再次普通截图的布局读值一致 |
| 基线树 `baseline-1793162485999/result.json` | 7/7 观察完成 | 未改名称的 `68031783` 同样横滚；不是本次 ARIA 适配新增的问题 |
| `focus-1793162685789/result.json` | 4/4 观察完成 | 记录公开 focus／scrollIntoView 调用与 DOM 事件、活动元素、越界 DOM |
| `native-focus-1793162781689/result.json` | 4/4 | 等待原滚动结束后直接触屏点击可见 Cancel，未偏移 |
| `variants-1793162844180/result.json` | 11/11 | 同源分别使用滚动结束后的 locator click、立即坐标 tap、Tab 到 Save／Cancel 后 Enter，均未偏移 |
| `native-final-1793162902601/result.json` | 10 项通过后未完成 | 两桌面完成；窄屏 light 的立即坐标 tap 未完成取消，保留原截图，不重试冒称通过 |
| `native-settled-final-1793162985990/result.json` | 25/25 | 等待既有滚动完成后的明暗 1440／390，验证实际指针命中、原生取消、完整布局及关闭侧栏后正文获焦 |

基线材料位于独立只读工作树 `comment-toolbar-layout-baseline/.presmium/comment-toolbar-accessibility/`，其余记录仍在本工作树 ignored 目录。

偏移发生在 `.pmw-frame` 内部：窄屏 clientWidth 为 390，scrollWidth 为 780，scrollLeft 从 0 到 277，所有正文后代随之左移；window.scrollX、visualViewport 和 body 的宽度／滚动均正常。越界内容是 Harness 关闭态右侧坞的 retained fullscreen 空面板，外层 rightbar 宽度为 0，内部 100vw 的空面板在 x=390 至 780。它解释外壳为何有可横滚空间，但不能仅据此推断人端焦点一定跳入该面板。

实际 focus trace 未发现焦点进入离屏坞。More actions 相关焦点会通过原 sidebar onFocus 调用 BlockNote 的 selectThread，后者对正文锚点执行 `scrollIntoView({behavior: 'smooth', block: 'center'})`。批注编辑器的 focus 使用 `preventScroll: true`。原失败的横滚在批注编辑器仍获焦时就已开始，不能归因于 Cancel 的焦点恢复。当前只在尚有原生滚动时紧接 locator click 的路径观察到该横滚；相同源码的稳定位置触屏与键盘操作没有复现，尚不能宣称所有快速连续交互都无问题。

最终 25 项消费者在输入后等待 60 个浏览器动画帧让已有滚动结束，再读取原 Cancel 中心的真实命中元素并发送原生触屏事件；没有 reset scroll、强制点击、隐藏元素、改 CSS 或插入产品等待。四组合 frame.scrollLeft 均为 0，侧栏完整落在视口内。四张 fullPage 图与对应 viewport 图均保留，四张 fullPage 图已实际查看。随后通过公开 Close 关闭侧栏，再实际点击正文，核对正文 BlockNote 为活动编辑元素。60 帧只是该诊断消费者的等待条件，不是产品延迟或性能结果。

本轮不对这个尚未稳定重现的人端时序问题做 CSS clip 或焦点补丁。关闭态右侧坞的溢出和立即坐标漏点仍作为限制保留，不能称为已修复。

## 检查与清理

Types 1323、layering 与 diff 检查通过，独立只读 peer 对最终公开 props／ref 适配给出 scoped APPROVE。
初版显式传入可能为 undefined 的 label 未通过公共联合类型检查，原 `types.log` 保留；最终通过明确分支透传原 props 解决，没有强制转换参数数据。
全部 11 轮私有 Studio（含独立基线）的 33 个 owner／子进程 PID 均已退出，浏览器、临时 home、workspace 与 fixture 已清理。每轮实际源清单、原 raw、消费者副本和清理结果在最终 ignored manifest 中逐项登记。
没有模型调用、外部访问、浏览器异常或 HTTP 错误。
没有新建 tracked 测试，没有运行测试套件，也没有操作公共 4320／17407。

在待验证源码的工作树目录执行 `node <此工作树绝对路径>/.presmium/comment-toolbar-accessibility/run.mjs after` 可重跑最终旅程。
消费者从当前工作目录加载真实 Studio 与依赖，创建随机端口和独立 workspace，输出新的 `after-<时间戳>` 目录并清理自己的资源。
`before` 参数只适用于未修复的基线，不作为修复后验收。

最后四组合可从待验证源码的工作树目录运行：

```sh
node <本工作树绝对路径>/.presmium/comment-toolbar-accessibility/native-settled-final.mjs native-settled-final
```

该脚本保留与原名称消费者相同的私有 workspace／随机端口与资源清理约束，追加布局与正文焦点断言。原 `run.mjs` 和失败记录继续保留，不覆盖。
