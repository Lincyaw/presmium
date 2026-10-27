# Studio 任务与 IR 事件交错

2026-10-27。在隔离 `studio-multitab-transport` worktree、随机端口和私有最小文稿上实际运行 Studio、Chromium、Workspace HTTP 与事件 WebSocket。没有模型调用、测试套件或新 tracked tests，没有访问公共 Studio。

本记录补充 [多标签页传输验证](studio-multitab-transport-2026-10-27.md)。原 17 项只覆盖文稿、诊断和审阅；这里单独验证 Present 的 IR 和导出任务，不把几轮结果合成一轮通过数。

## 两个实际反例与修复

首次原生打开 Present 与导出面板后，实际最新任务列表 GET 已在服务器返回空列表，浏览器暂缓交付。作者原生修改正文、保存并生成网站，真实事件依次报告 queued、running、done；页面已显示完成，输出 `web/index.html` 也包含新正文。此时释放原来的空 200，旧实现会移除完成任务，且没有更新一次列表读取来解释它。Present 同时收到与该任务一致的新 IR revision。

另一个窗口发生于首次基线之前：两个初始真实空列表都暂缓交付，外部 HTTP 启动真实 web 构建，queued、running、done 已经到达，但前端尚无 `JobsAnswer`。随后释放初始列表，旧实现仍显示没有生成记录。此处是公开协议消费者代表外部 agent 发起任务，不冒称原生按钮或 MCP tool 调用。

修复仅改 `packages/workbench/src/jobs.ts`：列表读取有最新请求序号，成功与失败都检查归属；每次读取记住开始时的 job sequence，只保留读取期间新增或推进的真实观察，不永久保留缺席的旧任务。无基线时收到真实事件，仅记录一个 scope 内布尔值；采用真实元数据后触发一次实际补读。订阅切换与停止会清除此标记。没有增加任务队列、事件账本、虚构目标或定时轮询。

## 实际结果与源码谱系

最终 `jobs.ts` SHA-256 为 `dec9f0c42c92e13b40cbc93cc65e1dda5495b7f56a64fb11eae3befe87c9b5b4`，基于提交 `6d3f087e`。下列路径均相对于该 worktree 的 ignored `.presmium/`；完整 SHA、31 源码哈希、进程与清理记录见 `ui-evidence/studio-job-feedback-final-manifest.json`。

| 独立记录目录 | 观察及结果 | jobs 源码 |
|---|---|---|
| `studio-events-topics-1793113861344` | 7 项观察确认完成任务被最新旧空列表吞掉；产品反例，不是验收通过 | `8923f7b6…` |
| `studio-events-topics-after-latest-1793114406432` | 7/7；同一次最新空列表晚于 done，完成任务仍可见；无更晚读取代为修复。实际输出、source 与新 IR 一致 | `88c2f482…` |
| `studio-jobs-first-baseline-before-1793114550818` | 4 项观察确认基线前真实外部任务丢失；产品反例 | `88c2f482…` |
| `studio-jobs-first-baseline-after-1793114771464` | 4/4；真实基线采用后仅补读一次，恢复真实完成任务与目标元数据 | 最终 `dec9f0c4…` |
| `studio-events-topics-after-older-cancel-1793114857736` | 7/7；新列表先采用后，旧空列表不能覆盖；从真实 running 事件发 HTTP 取消，回复仍 running，后续真实终态 cancelled、sequence 3、源版本绑定。原生开始与观察，协议取消 | 最终 `dec9f0c4…` |
| `studio-jobs-old-auth-error-1793115034871` | 4/4，0 构建；新 200 已采用后交付旧真实 401，任务错误未出现，实际诊断快照仍为空，全页截图无全局错误提示 | 最终 `dec9f0c4…` |

最后一条只对被暂缓请求的转发 Cookie 换成无效非凭据值，使真实后端返回 401；没有修改浏览器全局认证。它证明请求局部认证失败的晚回执归属，不是物理断网、500 或所有全局网络告警的验证。实际记录包含诊断 WS 数据、报告和全页截图，没有额外的全局告警 DOM selector 断言。

`88c2…` 是请求序号与 sequence 修复版本；最终版只再加入首次基线的事件标记。忽略目录保留最终源码及逆向移除此标记后的精确字节，逆替换 SHA 与 `88c2…` 一致。两份旧反例及旧 7/7 不改成最终源码运行；最后三轮的 31 个源码文件均与当前文件逐个相同。

初次 after `studio-events-topics-after-latest-1793114240726` 仅完成 1 项观察，未先取得真实目标元数据而无法点击生成，0 构建；保留原 `complete:false`，不计为产品回归或通过。中间版本 `4cc10b3f…` 在通用 merge 中设置基线标记，实际 4/4 后又收窄为仅真实订阅事件设置；该轮 `studio-jobs-first-baseline-after-1793114663653` 单列保留，不冒称最终字节。最终原始记录 SHA 分别为：

- 基线 4/4：`3264d505b7049596f45ba35039d738aeb679eaca34b552109cc04739208b0f4b`。
- 旧列表与运行中取消 7/7：`90a3e1d1fcd8168edc550c69d9175450bf20d1d906f154563f50330cf6f740e0`。
- 旧 401 4/4：`4483631eff1c0660ed7c1fe6e563e456c2673ceb1aef787a2726e65c6bb180bb`。

全部独立轮次合计启动 6 次必要的最小 web 构建：5 次完成、1 次取消，包括反例与中间验证，不能只统计最后两次。0 ASR／TTS／外部请求。所有轮次 finally 清除浏览器、私有 Studio home、工作区和临时 fixture；各 owner、backend、frontend PID 均已核实退出。最终源码轻量类型检查通过 1245 文件；分层检查与 diff 检查通过。没有覆盖其它浏览器、无限标签页、持久任务历史或物理断网下的所有交错。
