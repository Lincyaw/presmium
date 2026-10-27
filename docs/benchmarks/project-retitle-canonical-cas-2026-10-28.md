# 项目标题编辑回到 canonical CAS

项目计划的目录 gate 曾连带拒绝标题编辑：实际单文稿＋Git 和普通无 Git 工作区仍能通过原 `document/change` 保存标题，新 `project/plan` 却分别返回 `project-single-document-workspace`／`project-git-unavailable`。这两个环境原首页管理菜单均不显示；反例证明的是共享标题调用路径收窄，不是声称点击了隐藏菜单。

当前 retitle 与目录操作共用项目计划入口，但写入统一委托既有 DocumentEditor plan／apply／change。预检固定 canonical source、标题候选和配置；提交仍由原文稿 CAS、锁及可选 Git 历史负责，不新增 writer 或 Git 快照。HTTP 编辑者保 editor origin，MCP 保 agent origin、审批及 required-review gate。能力按 action 分开，文稿绑定 token 仅可 retitle 自己精确绑定的目标（含 `''`），目录管理范围保持原 gate。

标题计划／回执带真实 `source`；目录计划仍带真实 HEAD／tree。无 Git 的标题回执省略 snapshot／revision，已有 Git 时返回实际提交。普通源版本变化拒绝旧计划，当前结果才能重放相同回执。不新增菜单、浏览器模式、播放或编译行为。

## 实际运行

源码基线为独立分支 `69e93fd13edeb991a8d9c1e8193afe1f159cebb9`，增量仅五个运行源；并非当时主分支或公开 4320 的部署验收。忽略证据位于本 worktree 的 `.presmium/project-plans/`，均保留原字节。

| 证据 | 真实范围 |
|---|---|
| `retitle-before-1793140699445/result.json`，4/4 | 主分支 `200bf9c6` 原 canonical 路径与 `69e93fd1` 项目路径分别在单文稿＋Git、普通无 Git 启动真实 CLI 服务。原 canonical 两次 200；项目路径两次 409；当前分支的原 canonical 控制调用仍 200。四个私有服务／目录均清理 |
| `retitle-after-1793141343596/result.json`，complete:false，2 项已通过 | 首轮单文稿 HTTP 计划、保存、回执重放已过；随后无预授权的 SDK 请求被真实审批拒绝。本轮保留，不算 SDK 通过，不把它当产品 CAS 故障 |
| `retitle-after-1793141415985/result.json`，20/20 | 四个新鲜真实 CLI 服务：单文稿＋Git、普通无 Git、普通 Git、required-review。HTTP＋官方 MCP SDK 验 canonical source 与实际文件、预检零写、相同计划／回执重放、Git 的 editor／agent origin、无 Git 无虚构 snapshot、服务实际签发的文稿 token 精确范围、后来 canonical 输入后旧计划 409 且字节／HEAD 不变、目录 gate 保持、required-review 拒绝 MCP 而正常编辑者保存仍可用 |

最终 20 项的 25 个相关源 SHA 起止完全一致；清单与 raw SHA 见 `.presmium/project-plans/retitle-final-manifest.json`。四个服务 PID `1399643/1399718/1399817/1399945` 实查退出，四个任务私有目录删除，SDK client 全关闭，observer 错误为空。没有调用模型、ASR／TTS 或显式编译，也没有启动公共服务。

类型检查覆盖 1,276 个文件，另执行 layering／skills／packages／diff 轻检。没有运行套件、完整示例构建或重跑原项目 14 项浏览器旅程；本增量未改 UI、CSS 或浏览器接线，实际首页组合验收由根侧整合后另列。进程内计划／回执仍为既有 64 条、五分钟边界，不承诺跨进程持久化。根目录复制／移动／删除的安全语义与 opaque／插件私有引用搬移保证仍未完成。
