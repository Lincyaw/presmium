# 浏览器支持与验证

Presmium 支持最近两个大版本的 Chrome、Firefox、Safari 与 Edge。本文件说明哪些浏览器由端到端测试自动验证、哪些在发布前手工检查。测试的组织方式见 `architecture.md` 第 7 节。

## 自动验证

`pnpm e2e` 在 Chromium 中运行全部端到端用例；`PRESMIUM_E2E_BROWSERS` 列出的其他浏览器（默认 `firefox,webkit`）运行冒烟用例 `e2e/smoke.spec.ts`。浏览器用 `pnpm exec playwright install firefox webkit` 安装。没有安装或无法在本机启动的浏览器被跳过，`playwright.config.ts` 打印原因与安装命令：WebKit 需要的系统库可以用 `pnpm exec playwright install-deps webkit` 安装，或者在 Playwright 的 Docker 镜像中运行（见下文）。

| 浏览器 | Playwright 中的引擎 | 范围 |
|---|---|---|
| Chrome | Chrome for Testing 156（chromium v1248） | 全部端到端用例 |
| Firefox | Firefox 157（firefox v1555） | `e2e/smoke.spec.ts` |
| Safari | WebKit 27.2（webkit v2370） | `e2e/smoke.spec.ts`（冒烟用例另断言控制台没有错误） |

Edge 与 Chrome 使用同一引擎，由 Chromium 的结果覆盖；Edge 自身的界面差异在下面的手工检查中确认。

### 在 Docker 中运行 WebKit

开发主机缺少 WebKit 需要的系统库（如 `libevent-2.1-7t64`、`libavif16`）时，`playwright install` 报告依赖校验失败。可以在 Playwright 的 Docker 镜像（Ubuntu 24.04，装有这些库）中对同一个检出运行，镜像版本与 `@playwright/test` 的版本一致：

```sh
pnpm demo:build
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD:$PWD" -w "$PWD" -e PRESMIUM_E2E_BROWSERS=webkit \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  node_modules/.bin/playwright test --project=webkit
```

在 git worktree 中运行时还要挂载主仓库（`code.spec.ts` 读取 git 历史）。镜像版本与本机的浏览器版本不同时，可以把本机的 `~/.cache/ms-playwright` 挂载进容器并设置 `PLAYWRIGHT_BROWSERS_PATH`。

### WebKit 全量运行

冒烟用例之外，全部端到端用例（性能用例除外）也可以在 WebKit 中运行。已知的差异：`e2e/content.spec.ts` 的两个媒体用例在 Playwright 的 Linux 版 WebKit 中失败（音频的 `duration` 为 0，这个 WebKit 缺少该音频格式的解码器），在真实的 Safari 中手工确认。

## 发布前的手工检查

自动验证用的是 Playwright 的引擎：Chromium 覆盖 Chrome 与 Edge 的引擎，WebKit 近似 Safari，都只是当前的版本。所以每次发布前，在 macOS 与 Windows 上的真实 Safari、Edge 以及 Chrome、Firefox 的上一个大版本中，打开示例文稿的构建产物（`pnpm demo:build` 后用 `pnpm exec sirv examples/demo/dist/slides --single` 与 `pnpm exec sirv examples/demo/dist/web` 服务；重新构建后要重启这两个服务器），逐项检查：

1. 幻灯片形态：封面显示，方向键翻页与步骤前进、后退，`?clicks=` 直接打开某一步。
2. 幻灯片形态：演讲者视图（`/presenter/1`）显示备注与演讲者面板。
3. 网页形态：章节与讲解、侧栏与页内大纲、上一章与下一章（按章分页），搜索中文关键字并跳到结果。
4. 网页形态：视图菜单切换文档、滚动叙事与放映视图，章节与步骤保持。
5. 执行面板运行 Python 与 JavaScript，超时的运行显示预录输出。
6. 工具栏中的高对比度开关在两种形态中可用，刷新后保持。
7. 加载一次后断网，网页与幻灯片仍可打开与翻页。
