# Web 与 MCP 共用音色发现及取消

2026-10-27，在隔离 worktree 验证当前 canonical source 的实际音色能力、目录读取与共享请求取消。未改前端控件或样式。工作区只读服务不依赖 `CompileSession.ready()`；同一个实例供 Web 和 MCP 使用，真实 VOICEOVER 标记只表示实现已安装。

## 实际发现链

`.presmium/voice-authoring-consumer.mjs` 使用真实 Workspace 服务、官方 MCP client、HTTP、Compiler NodeServices 和故障插件。在最终 speech core 上，`voice-authoring-discovery.json` 13/13：

- 两个 MCP 工具实际可列出；配置未设引擎时为 unavailable，而已安装的 voiceover／preview 标记仍独立为 true。
- Web／MCP 的能力与目录回执逐项相同，均绑定实际 UUID、源字节版本及 fingerprint。
- 真实 Node setup 执行，故障 pass 没有执行；只有显式 `get_diagnostics` 才运行该 pass，随后目录仍可读取。
- expected source 过期返回 409 和 currentSource；HTTP 共享严格查询校验，超长 engine 拒绝；绑定别的文稿的 token 不能读取该目录。
- 两份 canonical 文稿字节不变；最终 14 份源 SHA 前后一致，客户端、服务与临时目录全部清理。

这一链没有引擎、ASR、TTS、浏览器或外网调用。它证明实际 unavailable 与编译独立性，不作为提供方成功证明。取消修复前的 13 项初始读取消费者另存 `voice-authoring-discovery-before-cancellation.json`。

## 真实提供方与取消因果

使用已固定版本的本机 Kokoro CPU 服务。HTTP relay 只转发其真实 `GET /audio/voices` 回执，按事件暂存响应体，不伪造音色；实际目录包含 72 项。没有合成调用。

`voice-catalog-cancel-before.json` 是修复前观察：8 项中 3 项 false。取消单读者、取消最后读者、关闭真实 Compiler／SourceEditor 装配的作者服务，在 500 ms 观察窗口后仍等待被暂存的响应；最后读者和 owner 关闭都没有中断实际 relay 连接。释放原响应后才结束。before 的 cleanup 已关闭 relay 并移除临时目录；其 connections=2 是 destroy 后异步 close 事件尚未排空的采样，不宣称该字段为零。

修复将 speech core 的共享 Promise 缓存改为有独立读者、请求 controller 和完成状态的缓存。单读者取消释放自身；最后读者离开先移除原条目，再中止请求。失败回调只移除同一条目，不能删除新请求；成功缓存继续复用。voices、合成前目录查验和 consent 沿公开 signal 传递取消，consent 的取消不作为目录失败写入 unlisted。

`voice-catalog-cancel-after.json` 最终 14/14：同一真实 GET 被两读者共享；取消一人不影响另一人取得 72 项真实目录；最后取消确实关闭网络连接；owner 关闭完成且不采用旧结果；成功目录留在缓存；同一事件循环中新读者使用新请求，旧 catch 不删除新缓存；取消 consent 不污染目录；目录读取中外部修改源返回 409。owner 关闭单次实测约 1.63 ms，before 在约 499.74 ms 仍未结束；这是一次受控观察，不是用户操作延迟的统计分布。

after 的 17 份源 SHA 前后一致，errors 为空；relayClosed=true、connections=0、临时目录移除，真实 Kokoro 服务保留给后续完整语音链使用。初次 after 的 owner-close 断言过早采样异步连接事件，13/14 原始记录保留为 `voice-catalog-cancel-after-owner-close-oracle.json`；补齐事件观测后得到最终结果，产品源码未为该断言再次修改。最初 jiti 导入错误在 relay／提供方启动前发生，独立 bootstrap 失败记录保留。

## 范围

本记录证明目录读取消费者的真实网络取消；不推导为 ASR、TTS 任务或设备录音取消已通过。完整人声转写、审阅采用、新配音和播放需单独真实验收；不会把原录音时间码当作新配音时间码。未新增 tracked tests 或运行测试套件。公开服务交付与浏览器四组合另有记录，不以这里的后端检查代替。
