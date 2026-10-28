# 浮层字幕的原生键盘滚读

2026-10-28，在独立 `caption-keyboard-scroll` 工作树修复公共 `PmCaption`。基线 `610f2182` 仅比调查时的 `5ca52411` 多交付文档。没有操作公共服务、修改文稿或运行模型、导出、测试套件及新 tracked tests。

## 问题与修复

长字幕保留全文，通过公共安全区内的 `overflow:auto` 滚动，没有自动分段。原真实调查 `recording-caption-readability/run-1793146429849/result.json` 完成观察 3/4：内容高 128、可视高 77，原生滚轮使 `scrollTop` 从 0 到 51，尾词可达；点击后实际焦点为字幕 section，Home／End 却保持滚动位置，并使父 Video 从 Step 1／0 秒跳到 Step 2／2 秒。该原始记录 SHA 为 `8368383f5f0b8e9979f18117c8cb8962146418aae8fe34301055c172cd7d0444`，不改成 4/4。

根因在公共组件与查看器的按键归属：`viewer/src/client/views/actions.ts` 在 window 冒泡阶段将 Home／End、上下键、PageUp／PageDown 和空格映射为放映导航并取消默认行为；焦点在只读字幕时不属于它原有的输入控件排除表。

只修改 `host/src/design/caption.ts`：先调用传入的 `onKeyDown`；浮层字幕对未取消、非输入法、无 Alt／Ctrl／Meta 的原生滚动键停止冒泡，不调用 `preventDefault`。浏览器继续管理滚动、焦点与滚动量。Shift＋空格保持向上滚动；左右步键、Escape、Tab 和其它播放键保持原来的处理路径。非浮层字幕不截键。

没有更改全局查看器键表、CSS、字幕文本、分段、播放时钟或焦点，也没有手写 `scrollTop`、选区、计时重试或另一套键盘状态。调用方优先、已取消事件、修饰键和输入法门槛经源码独立审查；本次实际界面未注入自定义 caller、修改键或输入法事件。

## 分阶段真实验证

同一真实私有文稿和原版 `startStudio({isolateClient:true})`，浅／深色 × 1440／390。使用原生 mouse wheel、点击、键盘；脚本只读滚动尺寸、尾词 Range 几何、焦点、父步骤与 keydown 事件。窄屏通过正式 RadioGroup 的 Visuals 选项进入可交互画面。

| 原始记录 | 实际范围与终态 |
| --- | --- |
| `after-1793146852492/result.json` | 前 16 项验证两种桌面组合，每种 8 项：原生滚轮、点击焦点、Home／End 精确首尾、其它垂直键及 Space／ShiftSpace、左右步键、浏览器默认未取消、Escape 退回 Doc。第 17 项记录窄屏确有溢出，随后消费者错误地操作后台 caption，被当前属性栏拦截；整份 `complete:false`，不是完整四组合通过。 |
| `after-1793146958882/result.json` | 重复桌面 16 项通过，但消费者将窄屏公共分段控件误写为 role=tab，点击超时，`complete:false`。保留原始记录，没有改产品去适应定位器。 |
| `after-1793147040650/result.json` | 正确 Radio 进入窄屏，4 项已证实 Home 到 0、End 到 110且仍为 Step 1；随后因消费者错误要求 PageUp 一次滚完整个 156 高内容而非一页，`complete:false`。 |
| `after-1793147151714/result.json` | 最后只补两种窄屏，17/17 完成。Home／End 仍严格首尾，其它垂直键按实际方向推进并等滚动稳定；所有滚动键保留默认行为、不到达 window 冒泡导航且父步骤始终为 1。左右键实际 1→2→1，Escape 实际退出 Video；最后确认原文稿和音频不变、零模型及外部请求。没有再重跑已证实的桌面。 |

上述 raw 位于本工作树 `.presmium/caption-keyboard-scroll/`，各份独立保留，不能拼成同轮 33/33。所有消费者的 1,243 个受版本控制包源码首尾与当前相同，公共 caption 唯一运行源 SHA 始终为 `d77ea7062609d57e07dcae00fe043cf367fc38e1872b2825ea72e9a00c70475b`。同目录 `source-evidence.json` 记录各轮 SHA、四组来源与清理；最终 manifest 记录提交文件和检查。

四组 End 稳定截图已实际查看。桌面字幕为 `scrollHeight=128/clientHeight=77`，Home／End 的 `scrollTop=0/51`；窄屏为 `156/46`，首尾为 `0/110`。尾词完整进入可视区，焦点仍在字幕，父时间与步骤不变。窄屏一次可见文字较少，完整讲稿需要主动滚读；此修复没有承诺自动逐句字幕或真实词对齐。事件审计只观察 capture／window bubble 与 `defaultPrevented`，不代替键盘或返回虚构结果。

## 来源、设计与清理

第一次拼接 ignored helper 有解析错误，未执行模块或创建服务；失败脚本保留。后续三份不完整记录均保留原失败与截图，产品源码没有在消费者运行时修改。

Figma 现有公共 `Presmium/Caption` `110:1847` 的 description 已实际追加上述键盘归属，session 为 `f99221e6-81e2-4735-b6b1-197f72ba03f9`。没有创建新节点或修改视觉；本地 ledger 和设计系统同步同一规则。

类型检查 1,288 文件通过，分层、技能、包结构及 diff 检查通过。四次 after 的 12 个自有 PID 实际全部不存在，browser、SDK client、临时 home／workspace／fixture／operator 均已清理。原 before 的资源另有已完成清理记录。没有停止其它 agent 的服务，没有变更 4320／17407。

本次是 Chromium 的桌面与移动触屏模拟，不声称实体移动键盘、其它浏览器、OS 输入法、Tab 全路径或自定义调用方处理器已经实际验收。没有重跑裁切 17 项或真实 WebM 导出，其先前独立证据保持原范围。

## 公共 4320 更新

提交 `70cb6a28e752ee740104448c0a8aa4e511259b8f` 已更新到公共服务。固定归档 9 包、560 文件、211 构建输入，原构建器的 1203 项来源检查通过。工作台入口字节与上一版相同；本次改变的是查看器实际使用的公共字幕组件，不能只用工作台入口 SHA 证明它已经生效。

公开示例 `bubble-sort` 的实际 Doc→Video、显式保存版本准备、字幕原生点击与 Home／End、左右切步通过 18/18。查看器与父工作台的稳定步骤、规范源和暂停状态共同核对；11 份文稿 SHA 不变，无模型、外部请求、页面错误或 HTTP 失败。记录为根 `.presmium/ui-evidence/live-caption-keyboard-70cb6a28-1793147586934.json`，SHA256 `8942a8262d7b3955f976f5826a0b83381971e5c8814ced79ae5f6a4d061b9a9b`。浏览器实际收到含字幕键盘实现的查看器脚本 `/__app/v/a9427d618a397890/assets/src-Cf1ShP12.js`，SHA256 `75777e7bc9009dac686ba68d1ff9897f373137b1a886b57a7e09a2c14781d794`；根已查看最终公开页截图。此公开例的字幕较短，长字幕首尾可达由前述私有四组合证明。

首次公开消费者 `live-caption-keyboard-70cb6a28-1793147475694.json` 的前 16 项为真，最后保护项失败：观察器把合法的空预览诊断 POST 当作文稿写入阻止了。原结果保留为 `complete:false`。依据 `PreviewDiagnostics` 和原预览池，只修改另一份 ignored 观察器，允许当前文稿、合法 renderer／实例／IR 修订且空 findings 的预览反馈，并单独记下两次报告；没有修改产品或放开文稿写入。上述 18/18 来自这份修正后的实际消费者，不把首次观察器错误归为产品故障。

普通 Doc／刷新与默认 MCP 状态另通过 22/22，记录 SHA256 `aabbd024b072f0d9e5b62257302c6e1448d6f11e8ce22b08b1e2684a505059c8`。重启前的 localhost／127.0.0.1 登录 cookie 均可继续打开文稿；旧的一次性启动地址失效，新地址正常，临时认证文件清理完成。所有公开消费者的自有浏览器和 SDK client 已关闭，服务保留；没有读取作者未提交草稿、编辑文稿、重新导出或推送。
