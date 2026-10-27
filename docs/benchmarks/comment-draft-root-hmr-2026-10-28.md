# 未确认批注稿与根客户端热更新

官方 Studio 保持 `client-hmr.disabled: true`。真实代码重建在此配置下保留编辑中的页面与批注输入。私有 profile 重新启用 DSH 的客户端热更新后，同样的真实重建导致自动整页恢复，丢失只保留在会话中的批注大稿；该组合尚未支持。

## 假设与判据

本次诊断的是持久化与客户端生命周期边界，不是渲染性能。三个假设分别用实际事件区分：

| 假设 | 支持判据 | 排除判据 |
| --- | --- | --- |
| 默认关闭 HMR，代码重建不更换编辑持有者 | 产物变化，但没有 rebuilt 交付、导航或输入丢失 | 默认配置实际发生替换 |
| 启用 HMR 后，根清理关闭内存稿与离开保护，再自动 reload | rebuilt、新代码执行与导航均发生，最新稿消失且没有离开确认 | 原页面继续存在，或新页面能取回最新稿 |
| 浏览器离开保护仍能阻止这次自动 reload | 发生 beforeunload 确认且 dismiss 后原稿可取回 | 没有确认且新页面无法取回最新稿 |

## 真实运行

从整合提交 `31e99713` 创建独立 worktree，使用私有临时 git 工作区、DSH home、自由端口与 Chromium。两轮都通过公开 `build/client.mjs` 重建该轮隔离 bundle；只在隔离副本的客户端入口增加可观察代码标记，实际产物 SHA-256 改变。没有改公共客户端产物，也没有 mock context、伪造 rebuilt 或向 sessionStorage 写 armed 值。

两轮均先在原生 reply composer 输入小稿，等待其真实 IndexedDB 记录；再用真实键盘输入替换为 1,048,759 个 UTF-16 字符的大稿。超过既有 1 Mi 字符备份上限时，界面实显 session-only 警告。重建前的大稿内容与输入的 SHA-256 完全一致，最新大稿没有写入 IndexedDB 或 canonical 文稿。

| 配置 | 重建后实际观察 | 产品结果 |
| --- | --- | --- |
| 官方默认 HMR off | 真实产物改变，未收到 shell rebuilt；文档内 UUID 不变，主文档导航仍为 1 次；最新输入与 Session only 候选仍可读 | 本轮正确，代码重建没有隐式刷新 |
| 私有正式补丁启用 client-hmr | 收到 `/plugins/events` 的 rebuilt，目标为 `@lincyaw/dsh`；新代码标记执行两次；文档 UUID 改变，主文档导航由 1 次增为 2 次；没有 beforeunload 对话框 | 最新大稿不在页面、IndexedDB 或恢复候选中，旧小稿仍在；本轮确认丢稿 |

两轮 canonical `lecture.json` 文件指纹均未改变。启用 HMR 的一轮还保留一次已有 `renderSlot('root') before any 'root' registration` 异常；HTTP 失败、外部地址及模型请求为零。本记录没有把导航恢复写成无异常的局部 HMR。

## 证据与清理

忽略证据位于此 worktree 的 `.presmium/comment-draft-hmr/before-1793138135474/`：`result.json`、`consumer-executed.mjs`、`hmr-false-after.png` 与 `hmr-true-after.png`。`result.json` SHA-256 为 `4d653b42642308db66ab9339c8820d099a96b1bfce7780e202b2d63c944a4f96`。`complete:true` 表示两轮观察完成，不表示启用 HMR 的产品行为正确；该轮明确为 `productCorrect:false`。

11 个因果运行源的起止指纹和当前源码一致。执行单元 exit 0，浏览器、两轮私有服务、临时 home、工作区与 fixture 均已关闭并删除；四个已记录服务 PID 均已退出。未新增 tracked tests，没有运行测试套件、IR 构建或外部媒体服务。

## 实现门槛

官方 `packages/dsh/web.patch.yml` 已声明 `client-hmr.disabled: true`，`launchPatches('web')` 与 Studio 启动器将其应用在 profile 层之后。自有宿主仍可用更后的补丁覆盖；这只能证明框架机制可启用，不能作为 Presmium 根编辑热替换已受支持的依据。

公开 DSH 文档说明替换会排空旧 fiber，清理回调可以异步并发执行，没有公开的卸载前阻止或草稿持有者交接契约。renderer 的 mount 入口由 shell 拥有。仅把返回点保存移到 dispose 前或阻止 checkpoint 导航，不能证明旧界面或内存稿仍可读取回。本片没有保留失效 Workbench、context 或 React root，没有新建草稿 storage、修改框架或增加常驻界面警告。

后续支持需要公开的卸载前保护或页面寿命的纯草稿 owner 交接，同时提供可用的取回入口，再验证真实的 strict pending、写入失败和 session-only 路径。本轮只确认了实际 admission 超限的会话稿；没有验证磁盘 quota、严格事务未完成时序、系统输入法或所有浏览器。此前已 strict 提交稿的恢复结果继续保留，不能替代这些未确认条件。
