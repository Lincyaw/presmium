# 正文输入复用页面导航快照

2026-10-27，从 `346667eb` 的完整文档界面测量 100 页、1000 正文块的输入。继续使用单个 BlockNote、全部页面 DOM、完整规范 JSON 与立即写入的会话草稿。没有延后权威输入、停用校验或隐藏页面，也没有修改 actor、原生历史、拖动依赖或权限规则。

## 调用链与修改

一次真实单键 CPU 采样中，React 渲染与提交约 32.82 ms，包含反复渲染的排序行、页面菜单、Radix Menu／Tooltip／Slot。`NavigationPane` 订阅整个 authoring；正文变化即使没有改变页名、顺序或可操作状态，也会重新生成所有页面行及菜单。

同一采样的正文 onChange 链约 15.44 ms，其中运行文稿投影约 5.69 ms，actor record 约 8.04 ms。后者包含约 3.98 ms 的克隆与约 4.06 ms 的同步草稿序列化／存储。字数缓存约 1.72 ms。这轮没有改动这些链路。

`DocumentOutline` 复用已有 `documentOutline` 投影，按文稿 identity、页面 ID、顺序、title、depth、number 比较，字段相同时返回相同的只读数组引用。缓存只保存导航显示数据。`NavigationPane` 分别订阅该快照、identity、documentId、reset 与原有权限、忙碌、失败、语言及当前位置；正文不再使整个导航重渲染。页面动作仍读取当前 Workbench 能力，scope、reset 和异步移动的身份检查保持。

## 无 profiler 的真实交替测量

文稿为 1,092,299 字节，每页 10 个约 230 字的真实段落。Chromium 无头，1440×1000，Node v24.22.0，64 逻辑 CPU。共享机器有其它开发任务，交替期系统 load 从 `1.49 / 1.67 / 1.67` 到 `2.33 / 1.86 / 1.73`；没有声称独占机器或总体 P95。

修改前先运行三轮：单键两帧为 `61.3 / 64.4 / 63.0 ms`，输入长任务为 `55 / 59 / 57 ms`。随后保留已构建的基线客户端，独立构建修改后客户端，按 before→after 顺序交替三对。两个私有客户端使用相同初始文稿，浏览器逐个运行。

| 项目 | Before 三轮 | After 三轮 | 中位数变化 |
| --- | --- | --- | --- |
| beforeinput 到文字可见后两帧 | 64.0 / 76.9 / 63.9 ms | 45.5 / 39.8 / 40.7 ms | 64.0 → 40.7 ms |
| 输入长任务 | 58 / 68 / 58 ms | 三轮均未记录 ≥50 ms 任务 | 只描述这三个样本 |
| 工具栏原生 Undo 到两帧 | 54.8 / 61.2 / 55.3 ms | 34.8 / 32.8 / 40.3 ms | 55.3 → 34.8 ms |
| 真实保存 200 回执 | 1854.0 / 1821.0 / 1799.0 ms | 1878.1 / 1883.4 / 1682.8 ms | 1821.0 → 1878.1 ms |
| 重载至完整文稿可编辑 | 2015 / 2000 / 2067 ms | 2033 / 2033 / 2049 ms | 2015 → 2033 ms |

保存仍包含原有 600 ms 合并窗口与完整服务端处理；没有将显示改善称作保存提速。首次客户端打开的暖身顺序不同，不将其当冷启动前后对照。

`navigation-outline-performance.json` 包含初始三轮及交替六轮，39 项检查完整通过：每轮均有 100 页、1000 段和一个编辑器，实际键入、200 保存与文件观测、原生 Undo、跨页鼠标选区以及重载全文。前端异常与 HTTP 失败为零，未请求 IR 或预览。

## CPU 复核及来源边界

`document-input-current-{profile,cpu-100,cpu-summary}.json` 与 `document-input-outline-after-{profile,cpu-100,cpu-summary}.json` 保存单次前后采样。后一次 React 子树约 5.96 ms，原排序行与菜单更新子树没有再出现；record 仍约 8.08 ms。采样下单键为 77.1 与 46.1 ms，不能与无 profiler 数值混算。

采样窗中的 program／idle 时间没有归为输入 CPU。Debugger 取脚本带来的后续 284 ms 任务也不计作单键长任务。后一次采样构建同时包含另两条工作线的 `document-session.ts` 与 `document-editor/rich-text.ts` 工作区变更；该纯段落输入不经过媒体远端采用或列表分组分支。该采样用于核对导航子树，不把总 CPU 差异全部归于本改动。

交替客户端未保存构建文件的 SHA，临时目录已清理，没有补造摘要。`navigation-outline-captured-script-hashes.json` 明确标记为 CDP 脱敏脚本快照摘要。最终功能消费者的实际 client 与 META SHA 另存于 `navigation-outline-capabilities.json`，与上述采样不是同一次构建。

## 功能与输入边界

`navigation-outline-capabilities.json` 完成 21/21 项：

- actor 深克隆与正文变化保持导航快照引用；标题、级别、顺序与编号变化使其失效，跨文稿 identity 与空文稿正确切换。
- 通过 CDP 触发 Chromium 组词事件，期间新建按钮及三个拖动手柄禁用，组词结束后恢复。此项只验证状态屏障，不替代操作系统输入法验证。
- 实际重命名请求返回 200 后挂起 ACK，忙碌期间按钮与手柄及时禁用；释放回执后标题与 reset 生效。下移操作使导航顺序和编号立即更新，此项检查导航显示，不另称其为排序持久化验收。
- 亮暗、1440 与 390 触屏四组合中，实际选择页面更新当前项，全文三页和唯一原生编辑器保持。四张 `navigation-outline-{light,dark}-{1440,390}.png` 已逐张查看；浅色桌面图保留了页面操作忙碌状态。

功能消费者的前端异常、HTTP 失败和生成请求均为零。第一次消费者在模态框打开时用默认可访问查询寻找被 aria-hidden 的背景按钮而超时，原记录保存在 `navigation-outline-capabilities-first-oracle.json`；改为读取同一背景按钮的 DOM 禁用属性，未修改产品逻辑。

初始计时脚本的 plain stdin 已关闭，交替流程由续跑消费者复用同一个基线客户端完成，原始三轮没有重跑替换。其自有进程树与全部临时目录在 finally 精确清理，记录保留该清理结果。所有服务使用系统分配端口，未触碰公开 Studio 或作者文稿。最终轻量检查为 types 1168、layering、skills 与 diff 通过，没有运行测试套件或新增受版本控制的测试。
