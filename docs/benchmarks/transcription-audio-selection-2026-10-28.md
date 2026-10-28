# 转写音频选择的来源归属

从 `0f57b1bcd10343d702f9455441d2d4b7e9d80cea` 建立独立工作树，真实私有 Studio 已复现并修复：保存录音 A 后，作者在转写卡手选 B；普通讲稿保存会把选择抢回 A。修后同一旅程保留 B，另验证实际录音保存 200 回执迟到时，后来手选的 B 也保留。公共服务和作者工作区未动。

## 原因与修改

录音保存向转写卡提供素材建议。原 effect 同时依赖资产对象，每次规范文稿更新产生新资产对象时，又采用旧建议 A，覆盖作者后来选择。现在每个保存建议只消费一次；手选和明确导入会退休旧建议。录音保存开始捕获选择代次，仅在期间没有后来选择时才提供新建议。代次只是当前界面的选择归属，不新增任务队列、内容写入器或播放时钟。

三个运行文件为 `ProductionPanel.tsx`、`ProductionRecording.tsx`、`ProductionTranscription.tsx`。录音候选、原音采用、ASR／TTS 任务、source CAS 和媒体事务沿原 owner；本片没有改变它们的契约或视觉。

## 真实浏览器证据

入口为 ignored `.presmium/audio-selection-audit/consumer.mjs`，使用原 `startStudio({isolateClient:true})`、临时工作区与随机端口。所有轮次保留执行脚本、截图、规范文稿和起止源码摘要。

| raw 目录 | 实际结果 |
|---|---|
| `before-1793155590231/` | 前 3 项通过后观察器超时；监听路径误用 `/document`，实际保存使用 `/document/change`。服务端确实保存，保留原失败，不计产品通过。 |
| `before-1793155699996/` | **5/5、complete:true、productCorrect:false**：实际录音保存 A，手选 B，原生讲稿输入得到真实保存 ACK，选择随之回 A。断言验证的是产品反例。 |
| `after-1793156180433/` | **8/8、complete:true**：同一讲稿保存后 B 保留；第二次原生录音已真实提交，持有其实际 200 回执，期间手选 A 再 B，释放回执后 B 仍保留。新录音素材真实存在，讲稿后来输入和 `voiceSource:none` 不变。 |

每轮登记的 1190 个源码／包配置／锁文件起止一致；after 与当前三个修改文件逐 SHA 相符。两张 after 图已实际查看，转写选择为 `Existing B.ogg`；另一处预览仍在更新，不据此宣称播放 ready。没有布局变化，未重复四组合视觉验收。

录音使用 Chromium 受控音频输入和原生 MediaRecorder，**不是物理麦克风验收**。B 为仓库已有、字节不变的合成 `guide-content/media/tone.ogg`。没有配置识别引擎，界面真实显示未配置转写服务；保存不启动 ASR、不改讲稿或声源。模型、外网、页面异常、HTTP 错误和观察器错误均为 0。本轮没有重新运行真实 ASR、讲稿采用、TTS、字幕对齐或导出，不把既有独立链算作本片复跑。

after owner／backend／frontend 为 `2810068／2810217／2810295`，三者已实查退出；浏览器、home、workspace 和 fixture 全清。两份 before 的六个服务进程也已实查不存在。证据索引为 ignored `.presmium/audio-selection-audit/final-manifest.json`。

类型检查通过 1314 文件，layering、tokens 41 和 `git diff --check` 通过；没有新增 tracked 测试、运行套件或构建全部示例。
## 4320 更新

运行版本 `9d7110498cf2e0822d3b037ddd6abac1457fefb9` 已更新至工作台。独立快照构建通过 1236 项来源检查，客户端 SHA-256 为 `4935d5b8b0d294a4bc58870646d5f9e57b2c61e8f7819ef14bffccae93ce41ce`。更新后只读健康检查 22 项通过，`localhost` 与 `127.0.0.1` 的既有认证会话正常，重启过程保留 11 份文稿。
