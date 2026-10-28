# 已批注正文的跨段框选

2026-10-28，以已部署 `c3eda1f0` 的真实 Studio 复查鼠标框选。起点位于已有批注标记内，终点在下一段；原生选区先正确扩展，松手前退到旧页标题。字体加载后仍复现，几何 hit test 分别命中 paragraph 与 body-edit，排除单纯坐标或字体未稳定。

只读事件记录显示，原生已有线程卡片在 mousedown 预选线程后打开，覆盖下一段的坐标。保持所有选区、store、首击和新建 composer 不变，仅在私有 counterfactual 通过公开 open=false 隐藏已有线程浮层，同一跨段恢复／Save／格式 Undo 旅程通过。故障落在适配的显示时机，不需要替换编辑器或重建 DOM 范围。

正式修复常驻原生 FloatingThreadController，按主体 pointer 生命周期与公开原生空选区状态控制 open。完成的 pointer click 只读浏览器 isCollapsed 布尔，避免快速框选时 PM 暂时保留旧 caret 导致重开；不读取偏移、不映射节点、不写 DOM Selection，也没有 selectionchange 监听或延时。原 selectedThread、回复 editor、关闭确认与首击 marked-link 消费保留。公共 hidden 类同时隐藏关闭过渡的 HTML 快照并透过指针，沿用原定位和 z-index。

实际 ignored 记录分别保留，不汇总为一轮通过：

| 记录 | 范围 |
|---|---|
| 根旧整合 WT 的 cross-range-1793144329638 | 初始真实失败，选区退到 Stable page。 |
| 根旧整合 WT 的 cross-range-1793144598566 | 字体就绪后仍失败，带完整只读 pointer／selectionchange 轨迹与原始几何。事件观测只用于诊断，没有进入产品。 |
| 本 WT popover-off-1793145001866 | 私有 public open=false 反事实 6/6，不是最终产品实现。 |
| 本 WT pointer-after-1793145337045 | 最终三个运行源，跨段原生框选、strict 恢复、精确 canonical anchor、Bold／Undo 6/6。 |
| 本 WT pointer-final-1793145484698 | 24/24：首击 marked 原生 caret 与 card、未提交 reply 隐藏再开仍完整；四组合实际 drag、备份、显式恢复、Save 与格式 Undo。1173 项 tracked 包源／样式／清单和锁文件起止/current一致，服务与浏览器全清。截图捕获于原生打开过渡中，最终视觉另取稳定态，不能将这组图片称稳定 opacity 验收。 |

Figma 已按设计转代码技能读取 NativeComments 269:5405 与截图，session e50ae959-ddd0-426f-9484-c771c5b4854c；仅补 interaction description，没有新增视觉变体、图标或素材。代码只在公共适配与公共 CSS 层改动。类型 1282、分层、令牌与 diff 检查通过，独立审查 scoped APPROVE。未新增 tracked tests，没有运行套件；不声明物理触屏、系统输入法或其它浏览器已验证。

最终稳定态 `pointer-final-visible-1793145753687/result.json` 再次通过 24/24，SHA256 `cc4eb7a631dd779239f107c872beb1c91202a829d8d7851075c9147826900618`。观察器等待原生浮层及祖先 opacity 为 1 后截图，没有增加产品延时。1173 项源起止/current 一致，私有浏览器、服务、认证目录与文稿清理完成；根逐张查看 1440/390 px 的亮暗四图。

稳定态截图的观察器准备曾因 Python 括号错误在加载消费者前退出，无服务或产品改动；已保 ignored scaffolding 记录。原始失败和成功材料均保留，最终视觉与精确提交摘要见同目录 final-manifest。
