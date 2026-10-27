# 共享配音任务的工作台交付

2026-10-27，公开 4320 从 `6e3efc53` 更新到已提交的 `029bdf32`，包含共享配音 owner `445390b5`、引擎配置缓存身份 `2d812670` 和 Web 任务观察器。没有推送远端。工作台任务来自 Web 或 MCP 时使用同一个 owner；完成后可自动更新当前缓存计划，未保存输入、组词和录音期间延后刷新。

实现和各自边界见[任务 owner](voiceover-task-owner-2026-10-27.md)、[缓存身份](speech-cache-profile-2026-10-27.md)与[Web 观察器](voiceover-ui-observer-2026-10-27.md)。本次组合运行使用先前真实人声闭环的 canonical 和原音频，没有再次 ASR 或采用讲稿。以下各轮分别保留，没有合并成一个总测试数。

| 实际运行 | 结果 | 证明范围 |
| --- | --- | --- |
| 私有 Studio、官方 MCP、真实本地 CPU TTS | core20，20/20 | 空闲生成窗口发现外部任务，显示运行与完成，自动更新可播计划；MCP 计划、音频资源和实际 profile 缓存 key/SHA 一致；1440／390 宽度的浅／深色四组合；仅一次合成、零 ASR |
| 同后端实际播放补证 | Play5，5/5 | 播放到 589 ms 后暂停，随后 16 个原生帧中的八次时钟样本保持 657 ms，iframe 字幕与权威讲稿一致；无新增模型调用 |
| 同后端原生录音保护 | guard9，9/9 | 真实 MediaRecorder 使用 Chromium 的受控 WAV 设备输入；缓存命中任务完成后录音继续，手动停止后才刷新计划，17,899 字节候选与实际 chunks SHA 一致；不代表物理麦克风验收 |
| 公开工作台只读验收 | 16/16 | 七工具可见，HTTP／MCP 空任务列表一致，未知任务明确 404；Doc 七页、一个原生编辑器；零编译／预览请求、写入、生成、外网请求和浏览器异常 |

公开验收的 30 份累计 TS／TSX 源码逐份与部署提交吻合，11 份作者文稿的 JSON 字节前后不变。公开环境没有配置语音引擎，因此只读验收保留真实 unavailable、计划缺 IR 的 503 和缺片段的 404，不把私有 CPU 服务的成功当作公开环境已可生成。

客户端使用原构建器从固定提交归档构建：九个包、519 份归档源文件、186 个构建输入。产物为 2,915,685 字节，比前一部署增加 4,616 字节。归档、输入与部署后字节核对均通过；未把 worktree 中的修改带入公开服务。这里是体积记录，不是交互性能改善结论。

重启前分别保存 `localhost:4320` 与 `127.0.0.1:4320` 的自有浏览器登录状态；重启后，两者的普通地址均返回 200、显示 11 份文稿。无 cookie 的旧启动链接返回 401，新完整入口可正常登录并移除地址栏令牌。浏览器状态临时文件已删除，入口文件由管理重启脚本更新。该验证不声明旧标签页的客户端代码热替换正常。

组合证据在隔离 worktree 的 `.presmium/voice-mcp-web-feedback-1793097419059/`：`core20-frozen.json`、`play-500ms-counter.json`、`final-manifest.json` 和 `root-final-verification.json`。root 实际核对 20 份运行源码、三份结果 SHA、七份保存材料的字节／权限、canonical 校验和原音 SHA，均吻合。保存材料包括旧、新两份真实缓存及未裁剪的原锁，不复制认证数据。首次消费者的 Chromium 导入错误发生在零提供方调用阶段，失败与清理记录保留；root 只读核验脚本的依赖解析错误也另存，不属于产品故障。

公开证据为 `.presmium/ui-evidence/live-shared-voice-deployment-029bdf32.json`、`live-owner-profile-readonly-smoke-029bdf32.json` 与 `auth-transition-shared-voice-feedback-20261027/result.json`。组合消费者的 11 个记录进程、前后端端口、私有认证和临时目录均已核实退出或删除；真实缓存与冻结结果 SHA 保持不变。CPU 容器随后只供弹窗文案验收读取真实目录，没有新增模型调用；验收后 root 核对任务标签并停止、删除两只自有容器，见 `.presmium/ui-evidence/cpu-speech-owned-cleanup-20261027.json`。固定镜像和模型缓存保留供明确复用，公开环境未启用这些提供方。

类型检查 1223 文件、layering、skills、tokens 与 diff 检查通过。没有新增 tracked tests，没有运行测试套件、全量示例构建或完整 e2e。字幕仍为 proportional，新 TTS 没有借用原人声的 ASR 词时。远端鉴权、物理设备、精确词对齐、完整视频导出及 MCP 全部作者动作仍需分别完成。
