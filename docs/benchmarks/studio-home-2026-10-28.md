# Studio 状态目录按安装分开（2026-10-28）

## 问题

`presmium-studio` 的 `DSH_HOME` 是 `$XDG_STATE_HOME/presmium/studio`，其中只有一个 profile `presmium-studio`，它的 `node_modules/@lincyaw/dsh` 软链接到启动它的检出。两个检出（主检出与工作树，或两个装好的版本）各自启动 Studio 时，后启动的一个把链接改指到自己的检出，先启动的一个在下次加载或重启 profile 时就运行另一个检出的代码。当天观察到：工作树的 Studio 改指了链接，主检出的 Studio 送出的是工作树的 dsh 客户端。同一目录中的日志 `presmium-studio.log` 以截断方式打开，后启动的一个也清空了先启动的一个的日志。

## 改动

`packages/studio/src/studio.ts`：profile 名为 `presmium-studio-<散列>`，散列是 `@lincyaw/studio` 解析到的 `@lincyaw/dsh` 包目录真实路径的 sha256 前 10 位；装好的包同样从 `@lincyaw/studio` 自己的目录解析（`@lincyaw/dsh` 导出了 `./package.json`），所以每个版本、每个检出各有一个 profile。日志改为 `presmium-studio-<散列>.log`。会话、凭据、`storages/` 仍在共用的 `DSH_HOME` 中。dsh 的界面把设置写进 profile 自己的 `cordis.patch.yml`，并以原子替换写入（`dsh-atomic-write`），所以不能用软链接共用这个文件；新 profile 第一次启动时复制最近改过的 `presmium-studio*` profile 的补丁（包括旧布局中的 `presmium-studio`）。旧目录与旧日志原样保留。

## 验证

环境：本分支工作树 `.presmium/worktrees/studio-home`（下称 A）；在临时目录中另建一个同一提交的分离工作树，应用同一改动，`pnpm install --prefer-offline`（下称 B）。B 的 `packages/dsh/src/client/index.tsx` 另加一行无害的标记 `globalThis.__presmiumCheckout = 'second-checkout-marker'`。两份示例副本由 `node examples/animations/try.mjs` 新准备。两个 Studio 用同一个临时 `XDG_STATE_HOME`，没有读写 `~/.local/state/presmium/studio`。

### 旧布局的设置保留

启动前把临时状态目录做成旧布局：只有 `profiles/presmium-studio/`，其 `cordis.patch.yml` 取自真实的状态目录，把 `ui-chat.transcriptView` 从 `compact` 改为 `detailed`，末尾加注释 `# old-layout-marker`，`node_modules/@lincyaw/dsh` 指向主检出。

A 启动（端口 4350）后：

| profile | `node_modules/@lincyaw/dsh` 指向 | `transcriptView` | 标记注释 |
|---|---|---|---|
| `presmium-studio`（旧） | 主检出 `packages/dsh`（未改动） | detailed | 有 |
| `presmium-studio-9bbfac9e60`（A） | A 的 `packages/dsh` | detailed | 有 |

两份补丁 `diff` 相同。以 A 的 dsh 对 A 的 profile 运行 `--dump-config`（带启动器的两个 `--patch`），合成结果中 `ui-chat` 行为 `transcriptView: detailed`、`performanceUsage: compact`，即作者原来的设置生效。

### 两个 Studio 同时运行

B 随后启动（端口 4351），新建 `presmium-studio-15ea924d83`，补丁同样取自最近的一个，链接指向 B 的 `packages/dsh`；A 的链接不变。从两个网址取页面，再取页面引用的 `plugins/??@lincyaw/dsh/client.js`：

| Studio | 客户端 rev | 字节 | sha256 前 16 位 | 标记出现次数 |
|---|---|---|---|---|
| A（4350） | `50f8c3dad464` | 3857204 | `6dcedce68e0e1f7a` | 0 |
| B（4351） | `ac25004d3758` | 3857259 | `44751eeb422cda10` | 1 |

### 重启一个不影响另一个

两个都停下后以按安装分开的日志重新启动，之后只停下并重启 A：

- 重启前后三个 profile 的链接完全相同：A 的指向 A，B 的指向 B，旧的指向主检出。
- B 一直在运行；重启 A 后 B 送出的客户端仍是 rev `ac25004d3758`、sha256 `44751eeb422cda10`、含标记；A 仍是 `50f8c3dad464`、`6dcedce68e0e1f7a`。
- B 的日志 `presmium-studio-15ea924d83.log` 重启 A 前后都是 5 行，只含 B 的工作区；A 的日志只含 A 的工作区。

对照：改动日志之前两个 Studio 共用 `presmium-studio.log`，B 启动后该文件只剩 B 的 5 行，A 已写的行全部丢失。

### 收尾

只停下本次启动的 Studio（A 先后三次、B 两次），删除了临时工作树；没有运行主检出的代码。

## 未验证

- 从 npm 装好的 `@lincyaw/studio` 启动：只读了代码路径（`createRequire(<studio 包目录>/package.json).resolve('@lincyaw/dsh/package.json')`，同一版本的安装路径固定，散列因此每次相同），没有实际运行。
- 设置在两个安装之间不再实时共用：同时运行时在一个 Studio 中改的设置只在它自己的 profile 中，另一个安装下次新建 profile 时才可能复制到。凭据（模型密钥）在 `DSH_HOME` 的 `.credentials.yaml` 中，仍共用。
- 没有运行测试套件；`packages/studio/test/studio.test.ts` 中断言旧日志与旧 profile 路径的部分已删除。
