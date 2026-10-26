# 公共制作时间线验证

日期：2026-10-26。

`PmTimeline` 只展示调用方提供的画面、配音和字幕计划，提交稳定步骤选择或时间定位意图。它不编译文稿、不写入 Production、不拥有播放时钟；调用方负责先暂停、核对来源与计划，再更新受控位置。缩放和适配只改变视图。`seekDisabled` 保留步骤选择，未知或估算时长禁用任意时间定位。

Figma 正式组件集为 [136:3258](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=136-3258)，状态矩阵为 [137:2178](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=137-2178)。三种密度分别覆盖就绪、焦点、估算、未知、加载和禁用，共 18 个变体。组件复用现有 Input、Button、IconButton、Range 与 Lucide 图标，尺和三轨共享时间轴起点，新增三项几何令牌已绑定 Figma 变量。Range 的进度样例按比例缩放，缺少真实音频时不画波形。设计上下文与明暗截图在实施前读取，轴对齐后的正式组合再次读取并查看。

临时真实消费者为 `.presmium/timeline-consumer.mjs`，原始记录为 `.presmium/ui-evidence/timeline-public.json`，最终 33/33 通过。消费者使用实际工作区服务产生的 `production-plan-proof.json` 的确认计划，并在独立副本中重新运行 Compiler 和 cache-only 讲授规划核对：总长 32000ms，画面 7 段、配音与字幕各 8 段。首音频的缓存键与 SHA256 均与该公共计划一致，真实 Ogg 经 `AudioWaveforms` 解码为 128 个峰值后才传入组件，没有替代音频或虚构波形。没有请求外部服务或调用付费合成。

实际操作包括：

- 原生 Range 的 Home、End、方向键，以及精确秒输入 `1.234` 提交 1234ms；非法文字保留且不定位。
- 真实鼠标拖动期间只显示本地预览，释放只提交一次；保持调用方不确认时，受控位置仍不变化。
- 尺面点击按实际像素位置提交时间；像素级点击不作为毫秒输入精度的替代。
- 拖动后按 Esc，再继续拖动并松开，不提交定位；卸载进行中的手势也不提交。初版取消手势的失败记录保留在 `timeline-pointer-cancel-before.json`，最终消费者已闭环。
- 放大只扩展轨道视口，不产生定位意图；适配恢复无额外横滚。初版计入内边距造成的 4px 多余横滚已修正。
- `seekDisabled` 禁 Range 与精确输入，步骤按钮仍可用；未知时长没有虚构时尺和波形，估算时长保留计划显示但禁任意时间定位；加载态真实声明 busy 并禁用步骤。
- 选中 accent 步骤在悬停时保留可辨识文字；短片段另有完整按钮热区，无需靠拖动命中。
- regular 输入与 Range 实测 36px，compact 为 30px／13px；真实 `hasTouch` 的 390px 消费者为 44px 热区／16px 输入。四组合的尺标文字矩形没有重叠，文档无横向溢出。

已实际查看 `timeline-{light,dark}-{1440,390}.png`，另查看真实粗指针的 `timeline-{light,dark}-touch.png`；主题切换后等待公共过渡完成再截图。消费者运行异常、HTTP 失败和外部请求均为零。

设计令牌与分层检查通过。没有新增 tracked 测试或运行套件，没有构建全部示例。本记录仅证明公共组件及该真实计划／Ogg 消费者；制作面板的来源版本确认、宿主时钟、跨步播放、其它音频格式和非 Chromium 浏览器分别验收。
