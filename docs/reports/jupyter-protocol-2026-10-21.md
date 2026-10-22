# Jupyter 协议实测（2026-10-21）

首次实测核心功能可用，浏览器离开页面后的执行目录清理失败。同日已修复代理模式下已建立内核的离页清理，并通过定向复测，见文末“修复与复测”。下面保留首次观测。使用真实的本地 Jupyter Server、Python kernel、Presmium 适配器、CLI 和 Chromium，没有 mock，也没有运行全量测试。

源码版本：`01b7cee42d9821ac0e9eb6433a409c5f46d4a326`。原始结果见 [JSON 记录](./jupyter-protocol-2026-10-21.json)。第二次浏览器检查复用了第一次的协议和 notebook 结果，JSON 中标记了 `reusedChecksFrom`，不算独立重跑这些检查。

## 环境与资源限制

macOS；Node.js 22.23.2；临时 Python 3.12.14 虚拟环境；Jupyter Server 2.21.1、ipykernel 7.4.0、nbformat 5.11.1、nbclient 0.11.0。服务仅监听本机，使用随机 token；浏览器通过 Presmium 开发服务的代理访问。

同时只运行一个测试流程。数值库、原生线程池和 Go/Rust 并发环境变量设为 1，libuv 线程池设为 2。这是线程预算配置，不是操作系统级 CPU 配额。临时服务已停止，临时环境及凭据已清除；没有修改项目依赖或业务代码。

## 功能结果

| 检查 | 结果 | 实际验证 |
| --- | --- | --- |
| 连接与环境探测 | 通过 | 实际连接服务，获取 kernel 信息与环境指纹 |
| 会话状态与隔离 | 通过 | 同一会话定义变量后得到 42；另一会话访问该变量得到 NameError |
| 工作目录与文件 | 通过 | 上传输入文件，读取中文内容，确认使用独立执行目录 |
| 参数与标准输入 | 通过 | 传入数值、字符串参数及输入行，检查 Python 输出 |
| 富输出 | 通过 | HTML、PNG、display update 和 clear output |
| 超时与恢复 | 通过 | 中断超时执行后，同一个 kernel 继续计算得到 42 |
| 主动释放 kernel | 通过 | 显式结束会话后，kernel 与对应执行目录均归零 |
| 终端协议 | 通过 | 真实 WebSocket 输入、输出、窗口尺寸调整与关闭 |
| Notebook 导出 | 通过 | CLI 导出 4 个 cell，通过 nbformat 校验，再用 nbclient 顺序执行 |
| Notebook 构建缓存 | 通过 | 再次构建命中远端执行缓存 |
| 网页运行 | 通过 | Chromium 点击实际运行按钮，通过开发代理执行，跨代码块复用会话；没有 page error |
| 网页终端 | 通过 | 输入 shell 命令，得到 presmium42；离开页面后终端消失 |
| 浏览器凭据边界 | 通过 | 此次代理模式下，服务端 token 未出现在浏览器请求和页面 HTML 中 |
| 离开网页后的目录清理 | **失败** | kernel 和终端均为 0，但等待 20 秒后仍有 1 个空执行目录 |

## 时间观测

这些是少量真实流程的耗时记录，不是受控性能基准，不能据此保证所有执行均低于 100 ms。

| 流程 | 耗时 | 范围 |
| --- | --- | --- |
| 已建立 kernel 上的文件、参数、富输出检查 | 约 13–17 ms / 项 | 每项包含请求与断言，只有少量样本 |
| 环境指纹 | 约 1.72 s | 包含 kernel 初始化 |
| 协议检查合计 | 约 6.89 s | 包含会话创建、隔离、超时中断及清理 |
| Notebook 流程合计 | 约 10.73 s | 包含首次构建、校验、重放与缓存构建 |
| 网页首次运行到显示结果 | 约 6.7 s、13.0 s | 两次观测，包含开发环境模块加载、kernel 冷启动及浏览器等待；不是纯 Python 执行时间 |

网页首次远端执行仍有明显冷启动开销；本次没有对其进一步拆分或优化。

## 清理缺口

复查时保持 Presmium 代理和 Jupyter Server 运行，离开网页后持续检查 20 秒，仍有一个空执行目录。随后停止临时服务并删除测试环境。此次没有发现仍在运行的 kernel 或终端。

相关代码在 `packages/addon-exec-jupyter/src/shared/kernel-lifecycle.ts` 与 `kernels.ts`：

- `shutdown` 先关闭 kernel，再通过 Contents API 删除目录（约第 132 行）。
- 临时执行的 `finally` 和 `dispose` 通过 `void shutdown(...)` 发起异步清理，没有等待完成（约第 249、312 行）。
- `removeDirectory` 捕获并忽略删除错误（约第 319 行）。

从代码推断，页面卸载可能中断关闭 kernel 后的目录清理请求或后续 JavaScript；这与 kernel 已消失、空目录仍存在的观测一致。尚未单独证明具体在哪一个网络请求中断。普通释放流程可以补齐异步等待；页面卸载场景需要让仍存活的服务端完成清理，不能仅依赖页面继续执行多个请求。本次仅记录，未修复。

## 覆盖范围

验证了本地 Jupyter Server 上的实际协议集成与网页开发代理。没有验证 Docker 镜像及 compose 配置、JupyterHub、GPU kernel、幻灯片 UI 或生产静态站点的 `auth: prompt` 部署；没有运行完整集成测试、完整 E2E 或课程全量构建。

## 修复与复测

代理模式的已知内核在 `pagehide` 中同步发出一条 `keepalive` 清理请求，由 Node 完成关闭内核及递归目录删除，避免依赖已离开的页面继续执行。普通销毁等待启动与清理任务；重复清理复用进行中的任务。服务端清理有独立的 15 秒总超时和 32 项在途上限，保留原有线程预算。临时执行遇到清理失败时记录告警，不覆盖成功的代码输出。

| 定向验证 | 结果 |
| --- | --- |
| 修复前的真实 Jupyter + Chromium 回归 | 复现：等待 20 秒仍有 1 个目录，kernel 和终端均为 0 |
| `e2e/exec-remote-cleanup.spec.ts` | 最终 3 项通过，合计 14.4 秒 |
| 导航离开与实际关闭标签页 | 连续两次生命周期，kernel、终端、含嵌套文件的目录均归零，代理保持运行 |
| 清理接口范围 | 拒绝路径穿越、额外 URL/token 字段及未声明环境；浏览器请求不含运营者 token |
| 真实清理失败的降级 | Python 写入隐藏文件导致 Jupyter 拒绝删除目录时，页面保留 live 输出 42，记录 warning，没有执行错误；残留目录由隔离测试环境的 teardown 移除 |
| `packages/addon-exec-jupyter/test/credentials.test.ts` | 2 项通过，合计 1.68 秒 |
| 分层、技能与差异检查 | 通过 |

本地回归用 `PRESMIUM_TEST_JUPYTER_PYTHON` 指向含 `jupyter_server`、`ipykernel` 的隔离 Python，然后运行 `pnpm exec playwright test e2e/exec-remote-cleanup.spec.ts --project chromium --no-deps --workers=1`。缺少该变量时用例明确跳过。也加强了原有 Docker 终端用例的目录及 kernel 检查，本机缺少 Docker，未运行它。

此次没有重新测试冷启动性能，也没有运行全量。临时服务、残留测试目录、虚拟环境及缓存均已清除。

仍有适用范围：静态直连 `auth: prompt`、`none` 没有 Node 清理服务；创建内核请求还未返回 ID 时立即关闭页面也无法可靠交接。服务器不列出的隐藏文件仍可能阻止目录删除，现会报告清理失败并保留执行结果。这次修复覆盖实际复现的代理模式下已建立内核的离页残留。
