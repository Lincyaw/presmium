# 页面列表空闲增删的成本

2026-10-27。`PmSortableList` 原先把成员 ID 集合放进 `SortableSession` 的 React key。新增页即使没有拖放手势，也会销毁管理器并重新注册全部行；之前原生新增页已保留 BlockNote 实例，这里仍有重复成本。

现在空闲成员变化通过官方 `useSortable` 的挂载和卸载注册，保留管理器及既有行 DOM。手势中的作用域、顺序、reset、可用状态变化继续使旧会话失效；等待移动结果时，成员集合变化也退休旧 owner。回执仍同时检查会话存活与请求身份，旧成功、拒绝或 finally 都不能清理新请求或夺回后来输入的焦点。样式、传感器和可访问名称保持原公共实现。

## 实际行为

本地忽略目录 `.presmium/ui-evidence/` 保留：

| 记录 | 范围 |
| --- | --- |
| `sortable-idle-probe.json` | 17/17。实际公共 React 消费者：空闲增删保持管理器与旧行 DOM、只增删目标注册；新行键盘及指针排序；外部顺序更新；手势中的成员、禁用与 reset 变化取消；pending 成员变化退休旧 owner，旧成功／拒绝不清新 pending、不抢正文输入。 |
| `sortable-idle-touch.json` | 2/2。真实粗指针浏览器操作新注册行，原生触屏传感器可完成移动。 |
| `sortable-idle-snapshot-performance.json` | 10/10。固定全部 Workbench/src 与 design/src 后，两个构建各只用同一快照的 84 个输入，没有回流到可变的原目录；仅 Sortable 源码不同，CSS SHA 相同。真实 50 页文稿、400 段与三个已加载动画，真实按钮新建第 51 页并保存。 |

固定源码的单对对照，可信 pointerdown 至原生光标可见后两帧：**193.0 → 118.9 ms**；光标本身可见为 178.4 → 106.9 ms。前者降低约 38.4%，仍未达到 100 ms。管理器原来从实例 1 变为 2，候选保持实例 1；两者均保持单个 BlockNote 和 reset 0。新页输入、最终真实 CAS、700 宽布局以及后来选择旧段落、旧回执不夺焦均通过。没有浏览器异常、HTTP 失败或生成调用，两个服务和临时快照均已清理。

早先 `sortable-idle-performance.json` 的八个样本有并行 Workbench 源码变化，保留为观察，不能用于本次因果归因。随后才补上上述固定完整源码的单对对照；不由单对样本推导 P95、跨浏览器性能或全部工程规模的提升。

两个初期消费者错误分别保留为 `sortable-idle-probe-harness-before.json` 和 `sortable-idle-probe-status-oracle-before.json`：私有候选复制重复已有清理分支而编译失败，及两个 live region 导致状态定位不唯一。修正消费者后才完成上表，不将它们解释为产品失败。

独立源审查通过。类型检查覆盖 1177 个文件，diff 检查通过；没有改 CSS 或新增公共控件，没有重跑旧视觉矩阵、测试套件或全量文稿构建，也没有操作公共服务或作者数据。新增页的前一阶段语义与 Undo／Redo 记录见[原生新增页](native-page-creation-2026-10-27.md)。
