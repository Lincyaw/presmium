# 工程代码失败与文档编辑隔离

2026-10-27，以 `8cf13779` 为起点，在随机实际端口的独立 Studio 使用 `bubble-sort` 私有副本。先确认全文与真实动画预览就绪，再实际破坏 `scenes/bubble.ts`，没有拦截或伪造 HTTP、IR 和编译回应。

## 修复前

`document-compile-isolation-before.json` 完成一条失败、编辑和修复链，保留 7 项检查中的一项真红：损坏的场景不能重新打包，inline 请求返回 503，正文仍是完整三页、一个 BlockNote 编辑器，并能原生输入及真实 CAS 保存。但显式点击“放映预览”却进入 `present`／`viewing`，工具栏显示“当前保存版本”，`presentationFailure` 为空。

这不是 IR 源版本丢失。运行 IR 与 JSON 版本一致；失败的是另行构建的浏览器代码包。`buildBundle` 在失败时保留旧 bundle，`prepare.ready` 只判断旧对象存在；完整页面与显式 app 准备没有验证其工程输入仍然有效。已有 block 请求才使用当前文件检查，所以同一工程表现为 inline 503、完整放映成功。Workspace 的 preview API 还会吞掉 viewer 准备异常，转成站点地址。

## 修改

`site-server.ts` 复用既有当前文件检查，命名改为 `currentDocumentBundle`，同时保护 block、完整页面及显式 `app(wait=true)`。旧代码包与不可变文件缓存保留；它们不能使新页面冒充当前工程。显式请求准备失败时，Workspace preview 传递真实非成功 HTTP，既有放映失败提示继续承接，正文入口不等待此过程。预取仍为尽力准备，没有增加 IR 或文稿字段。

每份文稿的 Node 状态仅保存最近一次当前 externals 所有的 bundle 错误。成功构建、确认有效缓存或更换 externals 时清除；显式错误回应携带真实打包消息，并通过 Node 的公开函数去除终端控制码。原生 IR diagnostics 在这条代码打包失败中仍为空，没有伪造 IR 诊断。

已有“查看错误详情”只显示请求方法、路径和 HTTP 状态，遵循其 transport metadata 边界；此修改没有把响应正文自动放进该界面。文件和行列可从真实 preview 错误回应及服务日志读取，agent 可使用同一接口。没有新增全文日志 UI、错误表或技术堆栈面板。

查看器的初始等待仍为 15 秒；随后当前代码包校验可继续等待已有或新构建。因此这里不承诺整个 preview 请求严格在 15 秒内完成，架构文档已同步。

## 真实验证边界

最终记录为 `document-compile-isolation-final.json`。前一版仅完成门槛修复的中间记录另保为 `document-compile-isolation-gate-intermediate.json`，没有把它当作最终错误定位版本。

最终 16 项检查全部通过：

- 真实代码包失败时，三页与一个原生正文编辑器保留；原生输入产生一次真实 `document/change`，保存确认后只改变预期正文，steps、讲稿和其他正文实体不变。
- 显式 preview 返回真实 500，仍为 document／editing，请求前实际稳定的 Summary 位置与已保存输入不变，没有采用 presentation snapshot。错误回应包含 `bubble-sort/scenes/bubble.ts:40:41` 及实际 Unexpected token，终端控制码已去除。
- 修好同一文件并点击原“放映预览”入口后，实际 iframe 的公开 IR source.version、fingerprint 与 meta 修订号对应当前 canonical 和 presentation snapshot，工程 projectRevision 也匹配；该 IR 包含失败期间保存的正文。放映失败与全局请求错误提示清除。
- 返回正文后，Bubble 恢复，Stats 仍保留上次失败结果；实际点击 Stats 自身重试后，两份 widget 均 ready 且不再显示失败。随后真实播放／暂停冒泡场景，确认五根柱子由修好的代码运行。没有把它写成所有 widget 会自动恢复的保证。
- 初始旧 `document.js` 的实际路径及 SHA 在失败后、修复后仍然存在且相等，未清空旧缓存。原生浏览器异常和生成请求均为零。

最终有 3 次故意损坏代码触发的 preview HTTP 500，属于被检验的真实失败，不能写成零 HTTP 错误。构建源与客户端 SHA、实际 HEAD 写在 raw 的 build 字段；私有 Node 在源修改后重新启动。三次私有运行的 browser／Studio／workspace／fixture 清理均在记录中，端口关闭另见 `document-compile-isolation-cleanup.json`。失败、修复后的放映及最终正文三张截图已逐张查看。

中间消费者误等文字“重试”按钮，而实际恢复入口是现有“放映预览”及 inline 重试图标；又把完整 viewer 的正文与幻灯片两套 DOM 一起计为必须恰好五根柱子，导致观察失败。原样保留这些失败，实际动画验证应限定当前 slide 或独立 block frame。另一次长 JSON 指令被交互终端截断，尚未执行产品动作，后续改为读取忽略目录中的脚本。

退出放映后，等待两份 widget 自动全部恢复的消费者也超时；实际状态是 Bubble ready、Stats 保留失败，后续通过 Stats 现有重试入口恢复。本次没有修改 widget 自动重试策略。

最终消费者准备失败期步骤时，还记录了一个独立未修复边界：点击 failed widget 的“下一步”后，原生正文为该 component 的 NodeSelection，但父阅读位置变为 Summary，widget 显示离页默认步。本次没有修改 Workbench、SourcePanel 或 BlockPreview 来掩盖它；显式编译失败保留位置的断言以请求前真实稳定位置为准，不能将这项控件位置问题称为已解决。

原始 JSON、脚本与截图位于忽略的 `.presmium/`、`.presmium/ui-evidence/`。未触及公共 4320／17407 或作者文稿，没有语音生成，没有运行矩阵、测试套件或新增 tracked tests。

类型检查（1168 文件）、分层及 `git diff --check` 通过。
