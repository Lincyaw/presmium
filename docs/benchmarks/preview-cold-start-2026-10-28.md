# 正文内嵌预览的冷启动：准备中不再算作失败

2026-10-28 在真实 Studio 中复现：Studio 刚启动（或源码改动迫使查看器应用、文稿代码重新构建）时打开 `guide-content`，正文编辑器里的组件块与 Mermaid／PlantUML 图表预览请求 `GET /api/presmium/preview?document=guide-content&view=web`。服务端等待约 15 s 后记录 `[viewer] ... cache=miss wait=true state=failed elapsedMs=15149` 并回答 500；几秒后同一请求 19 ms 回答 200，但编辑器里的卡片一直停在“预览失败”，回退区显示 `组件：PmMarkmap` 这类内部名字，作者只能重新载入页面。本记录说明原因、改动与真实浏览器结果。验证在独立临时工作区（`examples/animations/try.mjs` 生成）与独立 Studio（127.0.0.1:4337，每轮单独的 `XDG_CACHE_HOME`、`XDG_STATE_HOME`）上进行，没有使用共享的查看器缓存或其它端口上的服务。

## 原因与改动

**服务端把“还在构建”报成失败。** `site-server.ts` 的 `app(dir, wait)` 最多等 `WAIT_MS`（15 s）；超时后只要应用或文稿代码还没就绪就抛出“could not be built”，与真正的构建失败无法区分，工作台路由一律回答 500。现在等待结束时如果查看器应用或该文稿的代码仍在构建，抛出内核的 `PreviewPreparing`，日志记为 `state=building`；只有没有构建在进行、结果仍不可用时才算失败，并带上文稿代码或应用构建失败的原因（应用构建失败的原因此前没有保存，现在记在 `appFailure`）。`workbench-api` 把 `PreviewPreparing` 回答为 `503 {"error":"preview-preparing","retryAfterMs":1000}` 与 `Retry-After: 1`；Studio 的 `/api/presmium/*` 代理原先只转发白名单响应头，现已加入 `retry-after`。

**客户端不再一次失败就放弃。** `document-preview.ts` 新增 `readPreviewWhenReady`：收到 `preview-preparing` 时按 1、2、4、5 s（以服务端的 `retryAfterMs` 为底）退避后再问，直到就绪、调用方取消或答案不再需要；单次请求 45 s 超时（慢机器上服务端忙于构建、来不及回答）重试两次后才算失败。正文内嵌预览（`prepareDocumentPreview`，各卡片共享同一请求）与预览面板（`Workbench.#readPreview`）都改用它。带 `Retry-After` 的 503 不再记为工作台请求失败，不出现全局“操作未能完成”提示。

**卡片状态。** `DocumentBlockPreview` 增加 `preparing` 状态：标题显示“正在准备预览…／Preparing preview…”，预览区说明“首次打开或修改代码后需要稍候，预览准备好后会自动显示。”，就绪后预览自动出现，作者无需操作。真正的失败分两类给出简短原因：服务端构建失败为“这项预览暂时无法准备，请检查最近的修改后重试。”，画面加载失败或超时为“预览没有显示出来，请重试。”。失败状态下“重试”始终可点：此前按钮在请求进行中（每次最长 15 s）显示加载并禁用，卡片滚出视口时也禁用，看起来像失败后不能重试；现在失败状态不受可见性限制。说明文字使用公共类 `pm-ui-block-preview__pending`，它原先被 BlockNote 的 `.bn-default-styles p` 清掉了内边距和字号，公共样式改为限定在卡片内。

**回退区不显示内部名字。** `DocumentBlockFallback` 只用作者写的标题（块参数 `title`、定义的 `data.title` 或参数表的 `title`）；没有标题时显示作者能理解的类型：思维导图、视频、音频、动画、图片，场景为“动画”，其它为“内容／Content”。不再使用组件名、文件名、导出名或定义 ID。新文字放在 `block-preview-messages.ts`，没有改动正在并行修改的 `messages.ts`。

## 实际结果

截图与脚本在工作树的忽略目录 `.presmium/ui-evidence/preview-cold-start-2026-10-28/`。本机 24 核、构建快，冷构建约 6–9 s，达不到 15 s 的等待上限；为复现报告中 24 s 以上的构建，慢机器场景用 `systemd-run --user --scope -p CPUQuota=30%` 限制整个 Studio 的 CPU。时间为浏览器从点击打开文稿到正文 6 个预览块（2 个图表、思维导图、视频、音频、动画）全部 `data-status="ready"`，脚本依次把未就绪的卡片滚入视口。

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 冷启动，CPU 不限 | 10.1 s 全部就绪（应用 7.4 s 构建完，未触发超时） | 5.6 s 全部就绪（差别来自构建耗时波动；构建短于 15 s 时本改动不改变路径） |
| 热启动，CPU 不限（同一缓存重启 Studio） | — | 2.2 s |
| 冷启动，CPU 30% | 21.3 s 起第一批卡片 500→“预览失败”，39.8 s 思维导图同样失败；应用 39.3 s 构建完后卡片仍停在失败，100 s 未恢复 | 3 次 `503 Retry-After: 1`，卡片显示“正在准备预览…”；应用 68.9 s 构建完后 0.1 s 内服务端回答 200，76.7 s 全部就绪，无需操作（另一轮：92.9 s 构建，99.0 s 全部就绪） |
| 热启动，CPU 30% | — | 8.1 s |

服务端日志（CPU 30% 冷启动）：

```
[viewer] document="guide-content" cache=miss wait=true state=building elapsedMs=15194
[preview 1] document="guide-content" renderer=web prefetch=false state=preparing phase=viewer elapsedMs=15195
…（再两次 preparing）
the viewer app was built in 68.9 s
[viewer] document="guide-content" cache=miss wait=true state=ready elapsedMs=5941
```

| 检查 | 操作 | 结果 |
| --- | --- | --- |
| 准备中 | CPU 30% 冷启动，浅／深 × 1440／390 同时打开 `guide-content` | 四种组合在第一次 503 后均为 `preparing`，标题“正在准备预览…”，说明文字可读，刷新按钮显示加载 |
| 真实失败 | 在临时工作区给 `guide-steps/components/ActionCounter.tsx` 加一行 `import './does-not-exist.ts'`，打开 `guide-steps` | 服务端记录 `UNRESOLVED_IMPORT` 并回答 500；卡片“预览失败”，原因“这项预览暂时无法准备，请检查最近的修改后重试。”，回退区“内容”与作者写的说明，“重试”可点（四种组合 `disabled=false`） |
| 修复后重试 | 恢复该文件，点卡片的“重试” | 0.3 s 后卡片就绪；另一轮文件改动触发的重新编译先让卡片自动恢复 |
| 回退名字 | 打开 `guide-content` 与 `guide-steps` | 显示“思维导图”“视频”“音频”“动画”“内容”，不再出现 `PmMarkmap`、`PmMedia`、`ActionCounter` |

`node scripts/check-types.mjs`、`check-layering.mjs`、`check-tokens.mjs`、`check-skills.mjs` 通过。没有新增测试，没有运行测试套件、e2e 或示例完整构建。

## 未覆盖

- CPU 30% 下四个页面同时冷启动时，服务端事件循环被构建挤占，个别请求 80 s 才回答；单次 45 s 超时后客户端会重试两次，期间工作台仍会短暂显示传输失败提示，成功后清除。
- 预览面板（放映）的 `#readPreview` 同样在准备中重试，但只在正文场景下实际操作过。
- 其它插件组件（运行面板、测验、光标等）没有作者可读的类型名，回退区显示“内容”；插件声明可读名称需另行设计。`projection.ts` 中 `presmiumAtom` 的 `label` 只在块缺失时显示，且该文件正由其它工作并行修改，未在本次改动。
- 只在 Chromium 中验证。
