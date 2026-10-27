# 原生图片面板的公共适配

2026-10-27，使用独立随机实际端口 Studio、私有 git 文稿和真实图片导入服务，验证 BlockNote FilePanel 的公共样式。没有操作公共 4320／17407 或作者文稿，没有新增 tracked tests 或运行测试套件。

## 设计与范围

原 `native-image-upload-panel-probe.json` 记录桌面上传按钮为 30 高／12 字号，Tabs 为 36 高／14 字号。原控件没有对应的公共触屏密度，面板宽度沿用原生 500、padding 2。

先在正式 Figma 文件中补 [NativeFilePanel](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=211-4825)，包含 Upload／Embed／Loading／Failure × Compact／Touch 八个状态；[亮暗实例](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=211-4826)已查看。复用 ButtonCompact、FieldControlCompact、FieldControlTouch、既有 loading 图形、文本样式和 semantic 变量。上传选择器在运行时是原生按钮，使用居中的行动文字；嵌入地址仍是输入框。没有新增产品图标、上传器、说明卡或机制文句。

实现只在 `packages/design/src/components.css` 的 `.pm-ui-block-editor .bn-panel` 范围适配公开类与 role：桌面 30／13、coarse 44／16；面板使用已有 popover 最大宽度并保留视口边距；输入、行动、焦点、错误和加载使用公共令牌。原生 Tabs、Form、FileInput、LoadingOverlay、Loader 及事件均保留。没有复制框架组件、添加 JS 状态或改变 API。

面板根与 tab panel 使用额外的公开 `bn-container` 祖先，胜过原生后加载的同优先级规则；不使用 `!important`。LoadingOverlay 保留原生动画和 aria，只统一 surface、opacity、accent 与公开 `--loader-size`。原生大环曾为 36，正式控件为 16，最终通过公开变量取得 16×16。

## 真实功能与四组合

`native-file-panel-functional-after.json`（与原 `native-file-panel-after.json` 同一完成记录）25/25：亮暗 × 1440／390，各使用唯一私有文稿，均从实际原生空图入口打开。

- Upload 与 Embed 的原生 Tabs、输入框和提交按钮达到对应密度，面板不溢出视口。
- 真实 SVG 导入请求由 `route.fetch()` 发给实际后端，提交 200 后仅暂扣原响应。此时素材已在规范源落盘、图片块尚未采用，原生 LoadingOverlay 实际可见；没有 mock response 或伪造加载状态。
- 放行原响应后，原生上传回调把该素材绑定到原图片块，另一次正文 CAS 返回 200；浏览器真实解码图片。磁盘原始字节与上传内容 SHA 相同，表格和 3 条批注原值不变。
- 另一个规范空图上传 3 个无效字节，实际返回 422，原生局部错误显示，规范内容不变。Failure 的标签来自原生本地化，没有另造错误状态。
- 同页原生 Split 菜单实测桌面 30 高／13 字号，coarse 44 高／16 字号；不重复表格结构与历史链。

该记录有 4 次素材导入 200、4 次图片块回写 200，以及 4 条故意触发的格式 422。浏览器错误与生成请求均为零，不能称 HTTP 全零。导入是服务端真实字节探测与规范素材事务，不读取上传声明作为格式证据。

`native-file-panel-loading-after.json` 17/17，只补加载态公共令牌与尺寸：四组合均暂扣真实后端 200，实际 BCR 为 16×16、颜色为 accent、遮罩为 surface／0.55；放行后图片绑定与原字节仍正确。该记录不重复无效格式和表格业务。

`native-file-panel-appearance-after.json` 13/13，仅只读核对最终 Upload／Embed 与同页 Split：面板桌面宽 512、390 视口宽 358；输入常规字重、按钮 medium 字重、placeholder 使用 muted，桌面 13／触屏 16。没有 POST、浏览器错误、HTTP 失败或生成请求。

## 截图与保留的观察

`native-file-panel-{light,dark}-{1440,390}-{upload,embed,loading,failure}.png` 的 16 张组件截图已逐张查看；对应 `*-page.png` 保留面板在实际文档中的位置。Upload／Embed 来自最终只读外观记录，Loading 来自最终尺寸记录，Failure 来自真实格式 422 的功能记录，分别保留各自来源，没有冒充同一次运行。截图等实际浮层祖先 opacity 稳定后获取，不添加产品延时。

初次消费者只完成桌面 Upload、Embed、Failure 三项，随后没有观察到第二次上传 POST，而消费者无界等待尚未发生的 route callback。记录保留为 `native-file-panel-first-harness.json`，不据此确定产品原因；采集器补了观察上限及有条件的回调清理。其自有进程与三个私有目录已精确清理。最终消费者用独立空图分别验证成功与失败，没有把失败后重试夹在样式测量中。

旧加载图中的灰黑遮罩与蓝色环先按公共颜色修正，记录保留为 `native-file-panel-loading-color-only.json`；那份 13/13 没有尺寸断言，不能证明正式 16 控件。Root 随后实看指出真实环仍为 36，才补公开 size 变量与独立 BCR 断言，旧图保留为 `*-loading-color-only.png`。这些记录没有覆盖或洗掉原观察。

本文件不作为“上传失败后关闭面板再打开重试”的证据。该空图 render 生命周期修复属于独立功能范围，不归因于 CSS；这里也不声称已验证操作系统触屏的文件选择器交互。

## 清理与检查

每轮 Studio、浏览器、私有 fixture、workspace 与 home 均已结束并清理。首轮手动清理记录及后续各轮 finally 的 `cleanup` 均保留。脚本、源 SHA、Figma 节点和原始截图位于忽略的 `.presmium/` 与 `.presmium/ui-evidence/`；没有输出鉴权参数或完整启动地址。

令牌检查通过（39 份样式），`git diff --check` 通过。没有运行测试套件，也没有借控件验证重复正文性能或全篇批注回归。
