# 选中对象可见性与步骤位置

2026-10-27，在独立随机端口 Studio 中，用 `bubble-sort` 私有副本验证 failed widget 的“下一步”位置。真实场景先 ready，再实际损坏私有场景文件，仅观察正文与控件；没有重复编译隔离的编辑／放映修复主线，也没有文稿 CAS 写入。

## 已确认的原因

`failed-widget-selection-before.json` 复现了错误，4 项观测检查成立，不代表产品行为正确：下一步先选中 Pass 的第 2 步，随后阅读回调将它改为 Summary。

原生状态是 `NodeSelection`，from=181、to=182、head=182，选中 `presmiumAtom`／`pass--bubble`，正文保持焦点，实体归属 Pass。公开 `view.coordsAtPos(from)` 为 y=38 的零高线，已高于正文视口 y=90；但公开 `view.nodeDOM(from).getBoundingClientRect()` 为 y=38…700、高 662、宽 724，仍有 610 的高度处于视口内。被点击的按钮图标位于 y=617…633，同样可见。

真实时间线为：4022.8 ms 点击，4023.5 ms 位置进入 Pass step 1，4027 ms 收到 source-scroll，4031 ms 变为 Summary step 0。期间原生 NodeSelection、对象和焦点没有改变。将对象起点当作文本插入点可见性，错误地放行了阅读带规则。

## 修改范围

原生光标 helper 仅增加瞬时 `objectSelected` 标志，由公开 `NodeSelection` 类型判断。SourcePanel 的阅读帧对选中对象使用公开 nodeDOM 的矩形，其余选择仍使用原生坐标；缺少 Element 时保留原坐标路径。没有改原生按钮的 stopEvent、选区机制、内容格式或持久化数据。

文稿 identity／reset、原生焦点与 owner、位置代次、几何门槛及一次性读取继续生效。修改没有引入手势 latch、时间窗或正文锁，也不把表格内的普通光标替换成整张表的矩形。

## 独立实际验证

`failed-widget-selection-after.json` 使用相同短文稿和真实动作，5/5：原生起点仍离屏、对象仍可见，但“下一步”稳定保留 Pass step 1。原始 before 未覆盖。

原短文稿的最大滚动位置仍会保留长对象的大片可见区域，不能用于证明完全离屏行为。另一个仅扩展 Summary 正文的私有 fixture 保留相同控件步骤链，随后真实 wheel 把选中对象滚出视口。原生 NodeSelection 和正文焦点仍保持、owner 仍为 Pass，而 nodeDOM bottom=-200、视口 top=90；阅读位置可以进入 Summary。没有用失焦冒充离屏，也没有修改作者文稿。

`failed-widget-selection-offscreen.json` 最终 11/11，包含上述完全离屏边界，以及同一私有服务内浅深色 × 1440／390 的实际控件与位置查看。四个独立浏览器上下文都通过设置界面选择主题，操作目标失败卡片后，actor、原生 NodeSelection 与字幕页脚均保留 Pass step 1。桌面四颗按钮为 30×30，390 上原生 coarse 媒体查询为 true，按钮为 44×44；页面没有横向溢出。四张 `failed-widget-{light,dark}-{1440,390}.png` 已逐张查看，没有把它称为真实手机验证。

短 after 和长／四组合记录均没有文稿写入或浏览器异常。短 after 有一次、长／四组合有九次真实 preview HTTP 500，均由该私有场景的故意语法错误触发，不写成零 HTTP 错误。原始记录保留 observer 的 pointer、原生 selection、source-scroll 与 RAF 顺序，以及构建时两份产品源 SHA；最终 SHA 与冻结源码相等。

第一份视觉消费者在新上下文中等待屏外懒加载 widget 必须失败，因而超时，保留为 `failed-widget-selection-offscreen-initial-visual-oracle.json`。后续显式将目标卡片带入视口，再观察真实准备失败，没有为观察器修改产品。

脚本、原始 JSON 与截图位于忽略的 `.presmium/`、`.presmium/ui-evidence/`。所有浏览器与自有 Studio 在 finally 清理，没有使用公共 4320／17407，没有新增 tracked tests 或运行测试套件。

本次根代理的类型检查（1168 文件）与分层检查通过；本文作者未重复运行套件。
