# 浏览器验证记录

N-04 要求支持最近两个大版本的 Chrome、Firefox、Safari 与 Edge。本文件记录哪些浏览器由端到端测试自动验证、哪些在发布前手工检查，以及每次检查的结果。测试的组织方式见 `architecture.md` 第 7 节。

## 自动验证

`pnpm e2e` 在 Chromium 中运行全部端到端用例；`PRESMIUM_E2E_BROWSERS` 列出的其他浏览器（默认 `firefox`）运行冒烟用例 `e2e/smoke.spec.ts`。浏览器用 `pnpm exec playwright install firefox webkit` 安装。

| 浏览器 | Playwright 中的引擎 | 范围 | 2026-10-15 的结果 |
|---|---|---|---|
| Chrome | Chrome for Testing 156（chromium v1248） | 全部端到端用例 | 通过 |
| Firefox | Firefox 157（firefox v1555） | `e2e/smoke.spec.ts` | 通过 |
| Safari | WebKit 27.2（webkit v2370） | `e2e/smoke.spec.ts`，`PRESMIUM_E2E_BROWSERS=firefox,webkit` 时运行 | 未运行：开发主机缺少 WebKit 需要的系统库（`libevent-2.1-7t64`、`libavif16`），`playwright install` 报告依赖校验失败。在装有这些库的主机上（`sudo pnpm exec playwright install-deps webkit`）加上 `webkit` 运行 |

Edge 与 Chrome 使用同一引擎，由 Chromium 的结果覆盖；Edge 自身的界面差异在下面的手工检查中确认。

## 发布前的手工检查

每次发布前，在 Safari、Edge 以及 Chrome、Firefox 的上一个大版本中，打开示例文稿的构建产物（`pnpm demo:build` 后用 `pnpm exec sirv examples/demo/dist/slides --single` 与 `pnpm exec sirv examples/demo/dist/web` 服务），逐项检查并在下表中追加一行。

检查项：

1. 幻灯片形态：封面显示，方向键翻页与步骤前进、后退，`?clicks=` 直接打开某一步。
2. 幻灯片形态：演讲者视图（`/presenter/1`）显示备注与演讲者面板。
3. 网页形态：章节与讲解、侧栏与页内大纲、上一节与下一节，搜索中文关键字并跳到结果。
4. 网页形态：视图菜单切换文档、滚动叙事与放映视图，章节与步骤保持。
5. 执行面板运行 Python 与 JavaScript，超时的运行显示预录输出。
6. 工具栏中的高对比度开关在两种形态中可用，刷新后保持。
7. 加载一次后断网，网页与幻灯片仍可打开与翻页。

| 日期 | 版本（提交） | 浏览器与版本 | 结果 | 检查人 |
|---|---|---|---|---|
| 2026-10-15 | WP-60d | Safari、Edge | 尚未检查：首次发布前进行 | — |
