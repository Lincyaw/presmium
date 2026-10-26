# 公共排序列表验收

记录时间：2026-10-27 00:00:32 +08:00。
对象为 `PmSortableList`、原样抽取的公共基础控件，以及排序列表的公共 CSS。
独立 React 消费者使用 `@dnd-kit/react` 和 `@dnd-kit/dom` 0.5.1 的公开接口，没有启动或重建工作台，没有访问作者文稿。

## 控件边界

列表按稳定 ID 接收顺序，完成有效拖放后仅提交一次 `onMove(id, before)`；`before=null` 表示末尾。
拖动中的位置由依赖的默认预排机制呈现，异步提交期间只保留临时界面顺序；最终顺序仍由调用方传入。
同位置和取消操作不提交，失败返回调用方的顺序。
选择与菜单独立于排序，禁用排序或等待提交不会封住页面选择。

实现依据为官方的[受控排序说明](https://dndkit.com/react/guides/sortable-state-management/)、[useSortable](https://dndkit.com/react/hooks/use-sortable/) 和 [DragDropProvider](https://dndkit.com/react/components/drag-drop-provider/)。
默认预排期间 source 和 target 可以相同，因此采用 source 的 `initialIndex` 与 `index`，不根据两者 ID 是否相同判断移动。

文稿范围、成员集合或语言改变会建立新的手势归属。
外部顺序和 `resetKey` 在手势期间变化时取消旧手势，异步旧回执不能修改新的列表。
同一范围内正常采用移动结果保留手柄焦点；用户已转向正文输入、其它控件或窗口时不恢复旧焦点。

拖动手柄复用 `PmIconButton`，通过公开的 `tooltip=false` 将说明与读屏属性交给拖放依赖，避免 Tooltip 覆盖其 `aria-describedby`。
其它图标按钮的默认 Tooltip 不变。
键盘说明与操作播报不占用可见编辑区域。

## 真实运行

原始记录为忽略目录中的 `.presmium/ui-evidence/sortable-consumer.json`，40/40 项通过，浏览器异常和失败请求均为零。
没有新增受版本控制的测试，也没有运行测试套件。
下表的尺寸单位均为 CSS px。

| 范围 | 已观察结果 |
| --- | --- |
| 鼠标与键盘 | 有效移动只提交一次稳定 ID 操作；同位置、鼠标 Escape、键盘 Escape 均不提交；键盘完成和取消后保留手柄焦点 |
| 原生可访问性 | 聚焦手柄仍引用中文键盘说明；切换英文后说明和名称同步更新；依赖生成的占位克隆带 `aria-hidden=true` 与 `inert=true` |
| 异步采用 | 等待时临时顺序可见，选择和菜单仍可操作；成功采用调用方顺序，拒绝恢复调用方顺序，迟到失败不会夺走后来的输入焦点 |
| 来源变化 | 新范围、外部重置和手势期间外部顺序更新均清除旧手势影响，没有重复行或旧回执更新新列表 |
| 禁用与恢复 | 全局和单项禁用排序仍允许选择；取消后无需刷新即可继续排序；无关正文输入不被排序键盘传感器接管 |
| 触屏 | Chromium 的实际 Touch 事件完成一次移动和一次提交，没有用鼠标事件冒充触屏 |
| 密度与布局 | 高容器中行高仍为 compact 30、regular 36、touch 44，行间距 4；桌面文字为 13，触屏文字为 16，语义图标均为 16；390 宽无横向溢出 |

1440 与 390 宽分别采用实际浅色和深色，并检查三种密度，共 12 张 `sortable-{theme}-{width}-{density}.png` 截图，均已实际查看。
390 宽上下文启用真实粗指针，三种声明密度都保留 44 的触屏热区。
高度受限的容器不会把三行平均撑满整个窗格。

视觉目标为 Figma 的 [Presmium/SortableItem](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=158-2823)，包括三种密度与七种状态；浅深色对照为[状态矩阵](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=158-3034)。
运行时使用同一公共令牌，以及已登记的 Lucide `grip`、`more` 图标，没有运行时临时资产地址。

轻量检查通过：1156 个文件的类型检查、39 份样式的令牌检查及变更空白检查。
工作台中的真实页面管理流程由独立页面集成验收记录覆盖，本记录不将独立消费者当作后端事务验证。

## 验证边界

这 40 项中的键盘操作在按下 Space 后等待 80 ms，每次方向键后等待 100 ms，再发送放下或取消；通过结果仅覆盖该节奏。
`isDragSource` 和对应的 `data-dragging` 在依赖初始化期间就可能出现，不能作为 `dragstart` 已完成的证据；快速连键的独立调查见[键盘排序时序](sortable-keyboard-timing-2026-10-27.md)。
保留的中间探针还记录了 Tooltip 描述覆盖、外部顺序与依赖预排冲突，以及各自修正后的实际行为。
未验证真实系统输入法、其它浏览器或超长列表性能。
