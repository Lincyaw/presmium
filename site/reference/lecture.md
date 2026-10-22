---
title: 接口与版本
description: 哪些接口按语义化版本保持稳定，包、IR 与插件契约的版本规则
translations: { en: lecture.en.md }
---

(reference)=
# 接口与版本

Presmium 1.x 对公开接口按语义化版本承诺稳定。这一份文档说明三个版本号各管什么、哪些接口是公开的、哪些是实验性的。每个声明的签名见接口参考（导航栏的“API”，由 TypeDoc 从源码生成）。

Presmium 的稳定产品是核心（MyST 语法与 IR、编译器、渲染端、CLI）与它的产物（网页、幻灯片、notebook、讲授），它们不需要任何模型服务。工作台 `presmium studio` 与产物分离，是实验性的。

(versions)=
# 版本规则

(versions-numbers)=
## 三个版本号

| 版本 | 1.0 中 | 管什么 |
|---|---|---|
| 包的版本 | `1.0.0` | 全部公开的 npm 包，一起发布、版本相同 |
| `IR_VERSION` | `1` | IR 的 JSON 格式（`presmium ir` 与构建产物中的 `ir.json`） |
| `KERNEL_VERSION` | `1.0.0` | 插件契约，插件声明的 `kernel` 范围与它比较 |

(versions-packages)=
## 包的版本

- **主版本**：公开接口有不兼容的改动（删除、改名、改变签名或已有行为），或 `IR_VERSION`、`KERNEL_VERSION` 升主版本。
- **次版本**：兼容的新功能，如新的指令、选项、渲染端与契约中新的可选字段。
- **修订版本**：缺陷修复与文档。

要删除的公开接口先标为 `@deprecated`，至少保留到下一个主版本。所有公开的包用同一个版本，“Presmium 1.x”就是任一公开包的 1.x。

(versions-ir)=
## IR_VERSION

同一个 `IR_VERSION` 中只增加可选字段；删除或改名字段、改变字段的类型或含义、改变步骤与章节 ID 的规则都要提升 `IR_VERSION`，同时是包的主版本。读取 `ir.json` 的程序先检查它的 `ir` 字段。

(versions-kernel)=
## KERNEL_VERSION 与插件

`KERNEL_VERSION` 是插件契约的版本，与包的版本分开。插件在 Node 端入口与浏览器端的清单中写 `kernel: '^1.0.0'`；范围不包含当前版本的插件不被加载，`presmium check` 报告 `presmium.plugins`，构建不崩溃。契约有兼容的增加时升次版本，有不兼容的改动时升主版本。

插件对 `@lincyaw/kernel`、`@lincyaw/host`、`@lincyaw/viewer`、`@lincyaw/compiler` 中用到的包写对等依赖 `^1.0.0`，与应用共用一份；已安装的 Presmium 不满足它时，加载器同样报告并不加载这个插件。这样的插件可以用于任何 Presmium 1.x。

(public)=
# 公开接口

(public-documents)=
## 文稿、IR 与命令

- MyST 源语法：文稿头部的键、章节与标签、讲解与上屏内容、步骤、内置指令，以及官方插件的指令与行内角色。
- IR（`@lincyaw/kernel` 的 `IRDocument` 等类型）与 `IR_VERSION`；产物的布局与地址（`dist/ir.json`、`dist/<渲染端>/`、页面文件名与章节锚点、`?clicks=`、`?view=`）。
- `presmium build | dev | ir | check | serve` 与它们的选项、退出码、诊断的格式与检查 ID、`presmium check --json` 的结构；其他包带的命令（`presmium-mcp`、`presmium-export`、`presmium-diff`、`presmium-lecture`、`presmium-speech`、`presmium-language-server`、`presmium-classroom-server`）；MCP 的工具与资源。
- 工作区配置文件 `presmium.workspace.yaml` 与运营者设置、运营者的环境变量。

本地预览、构建和代码执行的常见原生线程池默认使用 1 个线程，libuv 线程池最多 2 个线程。运营者可设置 `PRESMIUM_MAX_THREADS` 调整原生线程预算，上限为可用逻辑处理器的一半（单核环境为 1）；更小的原生线程设置仍有效。这些软限制用于给其他应用保留资源，不能代替容器的 CPU 或内存配额。

编程接口的 `CompilerOptions.priority` 可为 `interactive` 或 `background`（默认）。同一宿主内顶层编译串行运行，交互任务先于排队的后台任务。`compiler.compile({ signal })` 接受 `AbortSignal`，在协作点取消过期编译；全局步骤、依赖校验与最终 IR 的完整性保持不变。

(public-contracts)=
## 插件契约

- `@lincyaw/kernel`：插件定义与清单、Node 端插件 `PresmiumNodePlugin` 的字段、`DirectiveSpec`、`RoleSpec`、`IRPass`、`Check`、`Finding`、`Renderer`、`RenderContext`、服务令牌与它们的接口（含 Node 端的服务）、服务端路由与 agent 工具，以及插件共用的纯函数。
- `@lincyaw/host`：组件用的组合式函数（`useStepState`、`useService`、`useSharedState`、`useServer`、`useMessages` 等）、宿主的服务（`TOOLBAR` 的 `tools` 与 `settings` 槽位、`NAVIGATION`、`OPERATIONS`）、设计系统的令牌与组件。
- `@lincyaw/viewer`：视图插件 `ViewerPlugin` 与它从上下文得到的注册函数、`useViewer`、`SectionView`、`BlockView`。
- `@lincyaw/cli/testing`：插件的集成测试用的 `presmium`。
- `@lincyaw/compiler`：`Compiler`、`Compilation`、`build`、`dev` 等编程接口。

公开接口签名中出现的类型随它一起公开。包导出的其他名字是 Presmium 自己的包之间共用的内部接口，即使接口参考中有它们，也可以在任何版本中改变。

(experimental)=
# 实验性接口

(experimental-workbench)=
## 工作台

以下接口是实验性的，不在 1.x 的承诺之内，可以在次版本中改变。其中的 TypeScript 声明在源码中带 `@experimental` 标签，接口参考中显示为 Experimental；界面与路由没有声明可以标注，以这里的列表为准。

- 工作台 `presmium studio` 的包：`@lincyaw/studio`、`@lincyaw/dsh`、`@lincyaw/workbench`（0.x）的全部导出与界面；
- 工作区服务为工作台提供的路由（文档、文件、源码、修改、修改历史与审阅）；
- 契约 `Focus`、`FocusReport`、`McpIssueOptions`，`@lincyaw/host` 的 `useToolbarPlacement`、`provideToolbarPlacement`。

命令 `presmium serve`、工作区配置文件与 Node 端的服务是公开接口；读者问答（`ASK` 与提问面板）是产物的一部分，也是公开接口。插件不要依赖实验性接口，依赖时在自己的对等依赖中写确切的版本。
