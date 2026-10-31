# 视频制作的四区工作区 · 2026-10-31

保留本次实现。参考 [CapCut 官方桌面编辑器](https://www.capcut.com/resource/capcut-desktop-download)的区域职责：左侧选择内容，中间看结果，右侧编辑当前选择，底部调整时间。上一版在原表单上增加分隔条，仍把页面选择、步骤、状态和播放集中堆在预览上方；本次重新安排了这些操作。

## 结果

- 左侧为可搜索的页面列表与音频素材标签；中间为预览，下方保留一组步骤按钮、时间、播放和速度；右侧为讲稿／配音／字幕属性；底部为贯穿全宽的画面、配音、字幕三轨。
- 标题栏使用公共 `PmPanelHeader`，主操作为右上角“导出”。问题计数进入同排，完整详情仍在公共浮层内滚动。导出使用对话框，保留后台工作区；沿用打开导出后停止录音／试听和相关转写活动的边界。
- `PmTabs variant="dock"` 管理标签样式与内容滚动；`keepMounted` 保留未激活的讲稿与素材编辑器。属性切到配音后，讲稿仍在 DOM 中，inactive 面板为 `display:none`。窄屏的后台预览为隐藏、inert 的保留帧。
- 时间线使用公共 editor 变体：单排位置、时长与缩放，不再套卡片或重复步骤按钮。轨道高 40 CSS 像素，类型同时由标签和底色表达。
- 制作预览沿用现有 playback 参数，将查看器底栏标记为 hidden；内部组件保留挂载。普通查看器未启用 externalControls 时保留原底栏。

## 实测

在 `/private/tmp/presmium-production-layout-20261031/workspace` 的 D3 副本启动隔离 Studio 4340。作者的 4320 工作区与打开页面没有重载或改写；副本沿用前一轮明确设置的静音来源，没有调用语音合成服务。

| 项目 | 观察结果 |
| --- | --- |
| 桌面视口 | 1710 × 788 CSS 像素；主标题栏 39 高，面板标题栏 30 高 |
| 默认分区 | 左／中／右宽约 305／949／440；上部工作区 434 高，预览帧 358 高；三轨同时可见 |
| 三个分隔条 | 方向键调整后宽约 390／779／525，上部高 399；页面与步骤保持不变；双击恢复比例 |
| 页面搜索 | “比例尺”返回 2 项，选择第 2 页后预览、步骤与属性同步；清空搜索恢复 19 页 |
| 列表长标题 | 两行选项约 46 高，内容约 40 高，无重叠；主标题省略并保留完整 title |
| 预览控制 | 内嵌查看器底栏不可见；时间线重复步骤条数量为 0 |
| 播放 | 时间从 00:00.500 前进至 00:00.613，可暂停；本页位置输入 1.500 秒后定位总时间 00:02.000、步骤 2，画面与字幕同步 |
| 属性与导出 | 配音标签可见“选择音色”，字幕标签可见“设置字幕时间”；导出对话框可打开与关闭，未触发实际导出 |
| 外观与断点 | 桌面亮／暗、684 CSS 像素宽亮／暗均查看。窄屏的页面素材、预览、属性和时间线切换正常，无页面横向溢出 |

窄屏使用 Chrome 250% 缩放触发断点，对应 684 × 315 CSS 视口；检查了短视口中的可见预览与标签切换，没有将其当作 700 × 900 设备验收。检查后已恢复 100% 缩放与跟随系统主题。

鼠标拖动仍未完成自动化验收：上一轮已确认工具的移动事件 `buttons=0`，本轮没有重复使用无效输入或改写依赖。三个分隔条的键盘路径已真实验证。本轮未申请麦克风权限，录音停止与候选保留沿用原组件生命周期并经独立代码审查。

## 构建与交付

- D3 编译 19 页、0 编译诊断；客户端真实构建通过。
- 类型检查 1430 文件、令牌检查 49 样式文件、分层、技能、42 包结构、严格界面文本及 `git diff --check` 通过。
- 独立审查发现并修复导出弹窗未停用录音／转写活动的问题，复查通过。
- 未新增测试，未运行测试套件、完整 e2e 或全部示例构建。
- Figma 同步公共 [PanelHeader](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=313-7410)、[DockedTabs](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=313-7432)、Timeline 的六个 Compact Editor 状态及[亮暗审阅实例](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=313-7839)，最终截图已查看。

截图：`/private/tmp/presmium-editing-workspace-light-20261031.png`、`/private/tmp/presmium-editing-workspace-dark-20261031.png`、`/private/tmp/presmium-editing-workspace-narrow-light-20261031.png`、`/private/tmp/presmium-editing-workspace-narrow-dark-20261031.png`。

## 后续调整：缩小底部时间线

按作者反馈收紧 editor 时间线：轨道文字从 13px 降至 12px，刻度与时长从 12px 降至 11px，轨道从 40px 降至 28px，行间距从 8px 降至 4px，标签列从 88px 降至 64px。工具栏控件仍为原来的 30px 紧凑尺寸，公共卡片时间线不变。默认上下分栏改为 71%／29%。Figma 同步六个 Editor 状态及对应的字号、行高、列宽变量，亮暗组件截图已查看。

在同样的 1710 × 788 CSS 视口，底部面板从约 267px 降至 203px，预览帧从 358px 增至 421px；第三轨底部为 778px，三轨均可见。实际字号为 12px／11px，三轨均为 28px，工具栏 39px。D3 本页输入 1.500 秒后仍定位到总时间 00:02.000 与步骤 2。桌面亮暗及 684 × 315 CSS 窄屏亮暗均查看，未见横向溢出；结束后恢复缩放与跟随系统主题。

客户端构建、1430 文件类型检查、49 样式令牌检查、`git diff --check` 与独立审查通过。未新增或运行测试套件。截图：`/private/tmp/presmium-compact-timeline-light-20261031.png`、`/private/tmp/presmium-compact-timeline-dark-20261031.png`、`/private/tmp/presmium-compact-timeline-narrow-light-20261031.png`、`/private/tmp/presmium-compact-timeline-narrow-dark-20261031.png`。
