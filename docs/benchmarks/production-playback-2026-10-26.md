# 制作播放头的公共播放器协议

日期：2026-10-26。范围是浏览器宿主、讲授播放器与版本化 iframe 桥接；制作区业务组合的验收另行记录。

`PRODUCTION_PLAYBACK` 只控制当前 `LecturePlayer`，位置来自其真实 clock、步内 Store 和实际重放的稳定步骤。Node 提供的 `source + irRevision + planId` 绑定整份保存文稿及共享播放计划，客户端不另行计算计划。`load`、`seek`、`pause`、`play`、`rate` 均经同一个播放器；定位先暂停、重放 `OPERATIONS`，再等待实际 `STEP_CLOCK` 的画面准备。首次加载完成前不报告虚构的零时刻。相同 ready 计划重复加载会暂停并保留实际时刻及速率。

桥接沿用 preview 的协议版本、nonce 与父窗口来源校验。回执携带唯一 request 和 binding；较新请求会取消旧加载、定位或播放授权。播放头流最多约每 100ms 报告一次，暂停、步骤、速率和错误变化即时报告。父级无需另设计时器。明确进入制作控制后，读者的讲授控制栏、尝试和逐字稿入口不再渲染，实际字幕仍由同一个播放器给出。

## 真实运行

忽略目录中的 `.presmium/production-playback-proof.mjs` 创建临时工作区，启动真实 `serveWorkspace`，打开实际预览页。观察插件只通过公开宿主令牌取得服务，不替代宿主、音频、计划或时钟。使用一份最小静音文稿、冒泡排序的独立缓存副本，以及移除一条实际 OGG 缓存的副本；未修改示例原文件或用户工作区。

最终原始结果为 `.presmium/ui-evidence/production-playback-proof.json`，24/24 通过，浏览器异常、HTTP 错误和外部请求均为零。检查覆盖：

- 未明确制作加载时，原有读者 transport 实际可见；明确加载后隐藏，保留同一播放器字幕。静音计划加载后保持暂停，整段和步内时刻、稳定页／步身份与 Node 计划一致；任意向前和反向定位更新真实导航与画面。
- 实际静音 clock 推进，暂停后停止；公共离散速率与读者播放器一致，非法速率及旧来源、旧完整 IR 修订、旧计划均拒绝。
- 相同计划重复加载保留实际 1000ms 时刻和 1.5 倍速率，且保持暂停。
- 实际 iframe 命令回执匹配 request／binding；播放必须取得现有音频焦点授权。晚到授权不能重新启动已暂停的播放器。
- 通过公开 `STEP_CLOCK.wait` 挂起真实宿主的准备 Promise，再连续请求两次定位；旧请求只有取消回执，最新请求才采用最终时刻。未替换 clock 或伪造时间。
- 截住真实 `production-plan` 请求时，loading 不含 position；暂停使在途加载失效，放行旧请求后不能采用或自动播放。
- 八条提交的精确缓存经绑定媒体端点载入；实际 OGG 播放推进同一个 MediaClock。跨页进入 GSAP 场景及反向定位在回执返回的同一 JS continuation 中直接读取 DOM，场景已经 ready，条形位置和动画时刻正确还原。
- 缺缓存计划保持 estimated，无真实 position，不能开始播放。整条运行没有浏览器异常、HTTP 错误或外部语音请求。

早期跨页定位检查在 Node 往返后读 DOM，掩盖了实际画面晚于回执的边界。严格同一 JS continuation 的记录 `production-playback-settled-before.json` 在第 18 项失败：播放器已经报告目标时间，但场景尚未挂载／仍在准备。修复先同步提交定位，等待浏览器提交帧以登记准备，再等待真实 `STEP_CLOCK.settled()` 和提交帧；取消信号可以取消帧等待。相同严格操作的最终记录通过，未把早期宽松检查当作充分证据。另一个 `production-playback-scene-selector-before.json` 是探针误选后台阅读页场景，纠正为当前 `.pm-present` 后复核，不是产品故障。

复杂静音副本另保留 `production-playback-silent-complex-before.json`：冒泡讲稿含位于正文中间的 cue，静音没有真实词语时间，Node 明确报告 `production.silent-cue-unknown`。这类计划没有伪造可播放时长；最小静音文稿的通过不代表该复杂情况已支持。

真实 Studio 首载另发现 ready 握手早于宿主插件的异步启动，首个制作请求因服务尚未登记而失败。`production-playback-studio-boot-before.json` 保留失败；Web 适配器先订阅运行修订，再等待真实启动完成或明确的缺失终态，取消时释放订阅。同一副本的 `production-playback-studio-diagnose.json` 与独立 `production-service-startup.json`（6/6）证明首个 load 已得到 ready，没有依靠手动重试、自动播放或重启服务。窄屏页签隐藏画面的整合仍单独验证。

轻量检查：类型（1148 个文件）、分层、包发布结构（40 个包）和 `git diff --check`。独立代码审查覆盖协议、加载与取消、资源释放和读者兼容路径；未写测试、未运行测试套件或示例两讲完整构建。

## 边界

这里只证明实际公开宿主和 iframe 协议，尚不替代完整 Studio 制作区的四种 Settings 显示组合、时间线业务、慢保存及来源切换验收。未调用付费服务或从缺失缓存生成语音，未证明新的配音提供方、录音混音或字幕词语对齐。非 Chromium 浏览器、真实系统输入法与读屏也未在本轮验证。
