# Jupyter 相关功能验证（2026-10-21）

18 项相关用例分批验证通过，5 项 Docker/GPU 用例因环境条件跳过。验证仓库提供的 Jupyter 集成，使用真实 Jupyter Server、Python kernel、JupyterHub、HTTP/WebSocket 代理、Presmium CLI 和 Chromium。没有 mock，也没有运行仓库全量测试。

源码基于 `01b7cee42d9821ac0e9eb6433a409c5f46d4a326` 加当前未提交修改。此前的离页目录清理修复与初始观测见 [首次实测记录](./jupyter-protocol-2026-10-21.md)。

## 环境与预算

macOS，Node.js 22.23.2，pnpm 11.20.0；隔离 Python 3.12.14；Jupyter Server 2.21.1、ipykernel 7.4.0、nbformat 5.11.1、nbclient 0.11.0；JupyterHub 6.1.1、configurable-http-proxy 5.3.0。

测试依次运行，单 worker，数值库与 Go/Rust 原生线程预算为 1，libuv 为 2。Jupyter 与 Hub 都使用临时 HOME、配置、凭据和文件目录，仅监听本机；Hub 只有一个测试学习者。依赖只安装到临时环境，没有修改仓库依赖。线程预算不是操作系统级 CPU 配额。所有自建服务均已停止，临时虚拟环境、配置、凭据、缓存及含过期测试令牌的跟踪产物已清除。

## 已验证范围

| 范围 | 验证的行为 | 用例 |
| --- | --- | --- |
| 环境与凭据 | 缺少地址、文稿与运营者地址不匹配时不发送凭据；拒绝令牌、关闭端口、缺少 kernel、错误语言、保留的 `auth: hub` 给出诊断 | `credentials.test.ts` 2 项；`local.test.ts` 的环境检查 |
| 提供方与录制 | 实际 kernel 规格与版本进入指纹；运行录制、缓存复用；`check --env` 检查真实服务 | `local.test.ts` |
| 会话 | 顺序执行、变量复用、不同会话隔离、结束后重置；不同浏览器上下文隔离，网页会话重置 | `local.test.ts`、`exec-remote-local.spec.ts` |
| 文件与输入输出 | 独立 cwd、嵌套上传文件、代码生成的嵌套目录；类型化参数、stdin、stdout、stderr、结构化 Python 错误 | `local.test.ts` |
| 富输出 | HTML、PNG、display update、clear output；网页清除脚本及事件处理器，保留正常内容 | `local.test.ts`、`exec-remote-local.spec.ts` |
| 超时与取消 | 超时中断、运行中取消后复用 kernel；提交前已取消和排队期间取消的代码不执行 | `local.test.ts` |
| Notebook | CLI 构建；nbformat 校验；nbclient 在新 kernel 上重放并比较输出；再次构建 0 次执行、3 次缓存命中；终端静态降级 | `local.test.ts` |
| 网页代理 | 预录与实时结果一致；请求走 Presmium 代理，页面及请求不含运营者令牌 | `exec-remote-local.spec.ts` |
| 静态站点 | `prompt` 取消、错误令牌后重试、正确令牌运行；网页与 Slidev 实际执行；令牌只放 sessionStorage，发往 Jupyter，产物不嵌入令牌；配置后的 `none` 无令牌运行 | `exec-remote-local.spec.ts` |
| 终端 | 网页与幻灯片 shell 输入输出；离页关闭；首次窗口 8 行、视口缩放后远端列数变化、shell 退出显示已结束并可重新打开 | `exec-remote-local.spec.ts`、`exec-remote-cleanup.spec.ts` |
| 清理与输入范围 | 临时执行、导航离开、实际关闭标签页后回收已建立的 kernel、终端及嵌套目录；清理失败保留成功输出；拒绝目录穿越、额外 URL/token、未知环境、错误方法、超大请求；重复清理不存在资源成功 | `exec-remote-cleanup.spec.ts` |
| JupyterHub | 错误令牌后重试；真实 `/hub/api/user` 发现学习者；请求进入 `/user/learner/api/kernels`，输出学习者名字与 42；临时 kernel 和目录归零 | `exec-remote-hub-local.spec.ts` 1 项 |

用例按行为分组，不把每条断言都算成独立测试。包内共享服务辅助为 `packages/addon-exec-jupyter/test/local-jupyter.ts`，浏览器与包测试复用它。

## 本轮发现并修复

1. **已取消请求仍会执行。** 修复前，提交时已取消的请求实际输出 `must-not-run`。现在在入口、队列开始、获取 kernel 后及发送执行消息前检查信号；提交前取消及排队取消均已验证不执行代码。
2. **错误令牌可能困在缓存中。** 实际 Jupyter 的无效令牌响应为 403，但没有 `Access-Control-Allow-Origin`；有效令牌响应为 200，并包含该头。浏览器因此可能只能报告 `Failed to fetch`，无法触发原来的 401/403 清理。现在静态连接请求的网络/跨域失败及 Hub 用户发现失败会忘掉该环境的令牌，允许重新输入，保留原始错误；可读取的认证失败使用本地化说明。没有通过修改服务的错误响应 CORS 配置使测试通过。

网络故障也可能触发重新输入令牌，因为浏览器无法把它与隐藏 HTTP 状态的认证拒绝区分。Python 程序错误不经过该连接失败分支，不会因此清空令牌。改动已做独立代码复核。

3. **shell 退出后界面不结束。** 客户端在发出最后的 disconnect 消息前已经释放连接并清空信号，原来只监听该消息收不到结束通知。现在通过公开的 `disposed` 信号通知界面、停止 manager 轮询；主动关闭有标记，避免旧连接影响重新打开的终端。真实 `exit` 后重新打开并输出 42 已通过。
4. **首次终端尺寸被丢弃。** 连接尚未建立时的 resize 原来直接丢弃，实际 PTY 首次为 24 行而不是要求的 8 行。现在缓存尺寸，连接后应用；实测首次 8 行，缩窄视口后仍为 8 行且列数减少。

## 测试批次

| 批次 | 结果 |
| --- | --- |
| 既有凭据与远端包测试 | 2 项通过；5 项 Docker/GPU 相关用例跳过，1.59 秒 |
| 本地提供方与 CLI | 修复取消后 8 项通过；notebook 文本表示断言修正后，该项单独通过。共验证 9 项，不宣称单次完整绿色运行；分别 16.09 秒、5.99 秒 |
| 浏览器首轮 | 清理 3 项、代理 1 项、静态 `none` 1 项通过；静态错误令牌问题复现 |
| 静态站点定向复查 | `prompt` 通过（用例主体 35.6 秒）；`none` 的尺寸及重连用例通过（主体 2.2 秒，含最小网页构建总计 20.9 秒）。最终浏览器独立用例共 6 项通过 |
| 本地真实 Hub | 1 项通过，26.3 秒，包含服务启动、最小网页构建与清理 |
| 轻量检查 | 分层检查、技能检查、差异空白检查通过；共享辅助移动后 9 项包用例加载成功 |

按独立用例去重，共 18 项通过：包协议/CLI 9 项、凭据 2 项、浏览器 6 项、Hub 1 项。过滤掉的其他用例不算环境跳过，也不重复计为通过；通过后没有为得到单次完整绿色汇总而重跑全部用例。

耗时是测试流程耗时，包含服务和构建，不能作为交互延迟或纯 Python 执行时间的基准。没有重新测量所有场景的 100 ms 目标。

## 未验证和已知边界

- 没有 Docker、NVIDIA GPU、gVisor 或 Kubernetes 环境，不能据本机进程测试推断镜像、GPU、沙箱或容器资源限制已验证。原有 Docker 浏览器测试未运行。
- 本轮只使用 Chromium 与 Python kernel；未验证 Firefox、WebKit、其他语言 kernel 或生产多用户 Hub 部署。未做真实网络断开后的自动重连，终端重连验证的是 shell 自然退出后重新打开。
- 静态直连没有 Presmium Node 清理服务；页面在 kernel 创建尚未返回 ID 或终端仍连接中就卸载的窗口没有可靠清理保证。
- Jupyter Contents API 不列出的隐藏文件可能阻止目录删除。真实隐藏文件场景已验证会告警并保留成功输出；隔离测试的 teardown 删除该残留。
- 清理服务的并发上限及总超时实现经过代码复核，未为了这些分支创建 32 个 kernel 或模拟所有网络故障。

## 定向复现

准备独立 Python，包含 `jupyter_server`、`ipykernel`、`nbformat`、`nbclient`，设置 `PRESMIUM_TEST_JUPYTER_PYTHON` 为其绝对路径，然后依次运行：

```sh
pnpm exec vitest run --project integration packages/addon-exec-jupyter/test/local.test.ts --maxWorkers=1 --no-file-parallelism
pnpm exec playwright test e2e/exec-remote-cleanup.spec.ts e2e/exec-remote-local.spec.ts --project chromium --no-deps --workers=1
```

Hub 另需该 Python 安装 `jupyterhub`，设置 `PRESMIUM_TEST_JUPYTER_PROXY` 为 `configurable-http-proxy` 的 JavaScript 入口，再运行：

```sh
pnpm exec playwright test e2e/exec-remote-hub-local.spec.ts --project chromium --no-deps --workers=1
```

缺少这些条件时测试明确跳过，不能计为通过。此次浏览器运行使用独立临时 Playwright 配置，只启用 Chromium、单 worker、关闭全局回归文稿服务，并把跟踪产物放在临时目录，避免启动无关服务或覆盖其他任务产物。
