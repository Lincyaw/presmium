# 键盘排序时序

`PmSortableList` 与直接使用 dnd kit 的消费者，在每键间设置 20、40、80 ms 等待的三组操作中，均各完成 9/9 次正确排序。Space、两个 ArrowDown、Space 连续发送且不增加等待时，均可出现无提交。此次调查保留这一边界，没有改产品的传感器、输入队列或放下屏障。

## 运行与观察方式

2026-10-27 00:18:19–00:21:51 +08:00，在独立端口的真实 React 消费者中运行 Chromium，依赖为 `@dnd-kit/react`、`@dnd-kit/dom` 0.5.1。没有重建工作台、重启 Studio 或写入作者文稿。记录每次受信任的原生 keydown／keyup、焦点、DOM 顺序，以及公开 manager 的状态和 monitor 事件。公共控件通过受支持的 `actions` 插槽挂载只读观察者，未增加产品调试接口。

两份原始记录位于忽略目录 `.presmium/ui-evidence/`：`sortable-rapid-cadence-before.json` 完成 60 次操作，`sortable-rapid-drop-probe.json` 完成 27 次操作；前端异常与失败请求均为零。它们是实际操作结果，包含预期目标未达成的记录，不是 87 项通过。两份记录均早于 00:22:40 的稳定 callback ref 改动，不能用来证明该性能改动的效果。

## 按键节奏

每次从 `a,b,c` 开始，向当前手柄发送 Space → ArrowDown → ArrowDown → Space。正确结果为 `b,c,a`，并且恰好一次移动提交。表中分母为重复次数，20／40／80 ms 是每次按键之间额外设置的等待时间；受浏览器协议开销影响，公共控件与直接消费者的实际 keydown 间隔分别合计为 22.8–33.9、42.8–51.4、83.2–92.3 ms。

| 消费者或公开配置 | 不增加等待 | 等待 20 ms | 等待 40 ms | 等待 80 ms |
| --- | --- | --- | --- | --- |
| `PmSortableList` | 0/3，无提交 | 3/3 | 3/3 | 3/3 |
| 直接使用 provider／useSortable，与公共控件相同配置 | 0/3，无提交 | 3/3 | 3/3 | 3/3 |
| 直接消费者，Feedback `clone` | 0/3，无提交 | 3/3 | 3/3 | 3/3 |
| 直接消费者，Feedback `none` | 0/3，无提交 | 0/3，无提交 | 0/3，无提交 | 0/3，无提交 |
| 直接消费者，Feedback `move` | 0/3，无提交 | 0/3，只移动一步 | 0/3，只移动一步 | 0/3，只移动一步 |

不增加等待时，公共控件的三次操作均在 `initializing` 状态结束，没有发出 `dragstart`。直接消费者两次也在初始化期间结束；另一次已发出 `dragstart`，但结束时 source 的 index 仍为 0，尚未采用预排结果。

公开的 [Feedback 配置](https://dndkit.com/extend/plugins/feedback/)可以改变反馈方式；本次 `none`、`move` 使原本成功的节奏退化，`clone` 没有改善无等待操作，因此均未用作修复。

## 初始化与放下边界

`isDragSource` 及控件的 `data-dragging` 在初始化时就可能为真。此次以依赖公开的 `dragstart` 事件和 `dragOperation.status.dragging` 区分初始化与可移动状态。对应版本的[启动流程](https://github.com/clauderic/dnd-kit/blob/01bc678/packages/abstract/src/core/manager/actions.ts)先登记 source，再等待 renderer 完成才发出 `dragstart`；[键盘传感器](https://github.com/clauderic/dnd-kit/blob/01bc678/packages/dom/src/core/sensors/keyboard/KeyboardSensor.ts)在缺少 shape 时直接忽略移动键，结束键仍可结束操作。这解释了初始化期间立即连键无提交的记录。

另一个边界发生在已启动之后：[排序键盘插件](https://github.com/clauderic/dnd-kit/blob/01bc678/packages/dom/src/sortable/plugins/SortableKeyboardPlugin.ts)与[预排插件](https://github.com/clauderic/dnd-kit/blob/01bc678/packages/dom/src/sortable/plugins/OptimisticSortingPlugin.ts)会异步等待 renderer 更新目标与 index。第二份记录在真正启动后，分别连续发送一个或两个方向键并立即放下，各重复三次：

| 消费者 | 一个方向键 | 两个方向键 |
| --- | --- | --- |
| `PmSortableList` | 3/3，移动一步 | 3/3，移动两步 |
| 直接消费者 | 0/3，无提交 | 0/3，无提交 |
| 直接消费者，仅在 dragend 中 suspend 并等待 renderer | 3/3，移动一步 | 0/3，只移动一步 |

单次 renderer 等待只能覆盖部分已排队更新，不能保住两个方向键的完整意图，也不能恢复初始化期间已忽略的输入。因此没有采用这个放下屏障，也没有重放按键或另写键盘引擎。公共控件在这组已启动操作中成功，不代表所有极短间隔均受保证。

既有[公共控件 40/40 验收](public-sortable-2026-10-27.md)与[工作台页面 29/29 验收](document-page-drag-2026-10-27.md)仍是各自记录节奏下的有效结果；两者均不证明初始化期间快速连键已修复。此次没有新增受版本控制的测试或运行测试套件，也没有追加可见说明文字。
