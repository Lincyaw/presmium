# 已采用录音的本步源区间

2026-10-28，在 `recording-source-trim` 隔离工作树、临时 workspace 与动态端口 Studio 中验证。基线为 `beb22a77`。没有操作公共服务、作者文稿或提供方，没有下载模型、新增 tracked tests 或运行测试套件。

## 已实现边界

`voiceSource.recording.sourceRange` 是可选的原文件毫秒区间。省略时整段播放。Video“旁白区间”只修改已采用同一资产的当前步骤：实际探测原音，输入入点／出点，明确应用，或将输入恢复整段后再应用。Doc 没有新增控件。

HTTP、MCP `adopt_recording` 与 Video 复用 `DocumentAudioAuthoring.adoptRecording`、原 SourceEditor 事务、锁、CAS、历史、回执和实际读回。范围进入请求签名与读回核验。新范围不能代替尚未完成的原音采用；真实文件 SHA 变化、非法范围和旧 source 均拒绝。保存回执中的 `durationMs` 仍是完整资产时长，`sourceRange` 和 `usedDurationMs` 表示实际使用区间；编译与运行仍为 `not-requested`。

计划按稳定 Step ID 保存每处录音使用。脚本轨把真实入点传给已有 MediaClock 与混音导出，原资产、完整 Narration、发音、cue、ASR provenance 和其它步骤保持原样。最短停留、结束停顿与动画仍参与原排程，裁切不覆盖它们。字幕保留整步讲稿且 `alignment=none`；实际有字幕时显示核对提示，没有讲稿则不虚构字幕。内部 pause／next、非起点 cue 和冲突起点继续沿用原有拒绝门槛。没有新 writer、队列、时钟或字幕对齐器。

## 分阶段真实记录

记录都在本工作树 `.presmium/recording-source-trim/`，原始 JSON 保留独立 SHA。各轮不是同一次总验收。

| 原始记录 | 实际范围 |
| --- | --- |
| `run-1793144334240/result.json` | 16/16，官方 MCP SDK 与原生 Video：真实 SHA／时长、先采用再裁切、同意图一次提交、篡改／旧源／非法区间拒绝、真实文件改字节拒绝；同一资产用于 A／B，只裁 A，B 仍完整 11 秒；讲稿原子与 provenance 不变。Video Apply、非法输入保留、恢复整段不自动保存、明确应用与真实 Play／Pause。Doc 无旁白区间入口。 |
| `export-1793144614173/result.json` | 5/5，实际公开 `presmium-lecture export` 命令、真实 WebM 与解码波形。A 使用 0.5–2.5 秒，B 使用 0–11 秒；VTT 保留整步完整讲稿，不输出假词时。 |
| `probe-before-1793144823615/result.json` | 3/3 反例观察，`productCorrect:false`。真实 A 音频检查 200 暂缓期间选择 B，释放后 B 因 effect 未依赖步骤 key 停留只读，没有发出 B 检查。 |
| `probe-after-1793144885886/result.json` | 3/3，增加稳定 key 依赖后，同一因果下 B 发出真实检查，出点 11 秒可编辑，canonical 不变。 |
| `matrix-1793145006379/result.json` | 8/8，英文浅／深色 × 1440／390，成对字段、非法范围和禁用状态；桌面额外暂缓真实已提交 200 后继续输入，旧 ACK 保留新字段且不自动采用；原生正文真实 CAS 后旧裁切请求 409，正文与已保存范围保留。四组截图已逐张查看。 |
| `keyboard-1793145290999/result.json` | 4/4，Restore full 按钮 Enter 只改待输入，字段 Enter 才提交；非法字段关联真实公共 Notice 内的错误文本。原字节不变，零模型／页面错误。 |
| `empty-script-1793145446399/result.json` | 2/2，最终源码：已裁切原音且无 Narration，真实 Video 字段可用，不显示不存在的字幕对齐警告；原字节保留。 |

音频来自此前已保存的真实 JFK WAV，SHA-256 为 `b9e1ae4e0837e7b99f05e4f61f70f5732320a56614ab4514d803fa85f9a563c4`，352,044 字节、PCM s16／16 kHz／单声道、真实时长 11,000 ms。本轮仅复制这个原音和已有 ASR provenance；没有重新识别、生成或把受控输入当物理麦克风。

原生播放使用实际 HTMLAudioElement：A 在播放时的原文件时间为 0.817249 秒，B 暂停在 0，界面讲授时间为 0.298 秒。审计只透明记录浏览器原 Audio 构造出的实例，不返回替代音频或模拟时钟。

公开 CLI 导出 320×180、2 fps、26 帧，实际 VP9／Opus、48 kHz 双声道。容器时长 13 秒，解码音频 13.0135 秒，容许实际 Opus 封装尾差 40 ms。A 波形与原文件 0.5 秒入点相关性 0.999563，B 与原文件 0 秒入点相关性 0.999555；A 错用整段起点的负对照仅 0.019691。原 canonical 和 WAV 的 SHA 均不变。导出文件 SHA-256 为 `5cee5607e13effa04495296c245bcccaa30368b198f73df68722206d6d706a6c`，只验证这次 WebM 路径，不扩称其它格式。

## 来源与保留的失败

最终运行源共 19 路径。`source-final.json` 列出各轮真实首尾 SHA、与最终源的差异；所有旧记录有 18 个源与当前精确一致，唯一变化为 `ProductionRecordingRange.tsx`。SDK／导出之后的变化是步骤检查归属、明确重读、错误反馈与字段关联。四组合之后仅增加字段 Enter 门槛、把错误 ID 放入公共 Notice 的子 span、以及实际字幕存在判断。逆掉最后字幕判断精确得到 keyboard4 的 UI SHA；再逆 Enter 与 span 两处精确得到 matrix8 的 UI SHA。最终 empty-script2 的 19 源全部首尾与当前一致，不称早期 16／5 为最终 19 源全量复跑。

- 首次导出 `export-1793144522959` 0/1、`complete:false`，实际 CLI 报私有临时文稿缺少公开插件依赖。只在该私有消费者目录补正确公开包链接后导出 5/5；没有改产品或用 broad node_modules 链接伪装依赖。
- 首次独立步骤 probe helper 有一次解析错误，没有启动 Studio；原工具输出保留。真正 before 和 after 分别保留，不将 before 的预期红当修后通过。
- `keyboard-1793145247496` 3/3 只验证键盘，后来发现公共 PmNotice 不接 `id` 的类型错误。修为内层 span 后 keyboard4 补了实际关联目标，原 3 项 raw 不改写。
- `types-final.txt` 保留这两条重复类型诊断；修正后的 `types-final3.txt` 为 1,286 文件通过。分层、技能、包发布结构与 diff 检查另记于最终 manifest。

本轮按正式 Figma `168:3749` 的高清 context／截图复用成对入出点、原长／使用长度和 Apply／Restore full 语法。该正式组件仍是背景 MediaClipEditor，只借公共字段布局，不声称它原本包含旁白业务。上下文 session 与引用范围已登记在 `figma-nodes.json`；没有新增虚构节点、视觉 primitive、CSS、令牌或素材。

## 清理与未验范围

`cleanup-final.json` 确认各轮 25 个自有 PID 均不存在，browser、client、临时 home／workspace／fixture／operator 均清理。只保留忽略证据、截图、原音私有副本和导出，不保留认证地址或凭据到公开文档。未启动模型或付费服务。

范围输入是 Video 本会话待应用状态，不承诺离开 Video 或崩溃后持久恢复。没有验证裁切请求同时遇到新麦克风、跨文稿后台回执、运行中取消与审阅所需模式的新组合；原共用事务门禁保留，但不把旧采用证明算成本轮重测。物理麦克风、其它浏览器、视频源文件、跨步骤连续切片、字幕重新对齐、ASR 局部范围及全 MCP 人机操作对齐仍未完成。
