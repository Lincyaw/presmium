# 文稿保存的输入停顿与旧回执

2026-10-27，在独立随机端口 Studio、模板文稿私有副本和真实 workspace 服务上验证。
依据 [工作台输入与保存规则](../rfc-workbench-uiux.md)，普通输入在最后一次输入后等待 600 ms，组词结束后重新计时；显式来源操作可以立即保存。

## 根因与改动

`DocumentSession.composition(false)` 原来直接调用 `#save`。
操作系统输入法原始记录 `os-ime-studio-observed-before.json` 测得组词结束到首个保存请求为 8 ms。
该原始链还有中文结果错误，整体未通过；这里仅引用 8 ms 的保存时点，不把该链计为输入法通过。

另一个绕过等待的入口是旧保存回执：`#save` 开始就清除 timer，finally 又直接调用 `#save`，会提前提交 flight 期间的新输入。
现在 `record` 与组词状态变化共用 `#schedule`，待执行的 timer 阻止自动 `#save`。
timer 回调先清空句柄再尝试保存，旧回执的 finally 保留新输入尚未到期的 timer。
显式 `flush` 和 `retry` 可以取消 timer 并立即保存，原有 flight、身份、输入代次和冲突屏障保持。

## 真实浏览器结果

忽略目录内 `document-save-debounce.mjs` 完整 **15/15**，原始记录为 `.presmium/ui-evidence/document-save-debounce.json`。
真实正文输入、原生 InputEvent 与实际请求使用同一浏览器的 `performance.now()` 计时。
观察器只记录事件并原样委托 `fetch`。

| 场景 | 请求时点或检查结果 |
| --- | --- |
| 普通正文输入 | 451.9 ms 时没有请求，610.9 ms 发出首个请求 |
| 输入 302 ms 后继续输入 | 第二次输入后 402.2 ms 仍无新请求，604.2 ms 后保存；距第一次输入 907 ms |
| 真实旧请求已返回 200 并落盘，暂扣回执，再继续输入 | 新输入后 456 ms 没有下一请求，旧已保存文字与新可见文字均保留；604.2 ms 后保存完整新输入 |
| 输入后明确新建页面 | 53.9 ms 发出正文保存，随后真实创建页面，正文与新页面同时保留 |
| 输入后明确进入视频制作 | 62.4 ms 发出正文保存，进入独立制作界面时磁盘已含完整输入 |

旧回执用 Playwright `route.fetch()` 获取真实服务结果，仅延后该结果交付给浏览器，没有伪造响应或替换服务端。
本次共 7 次真实规范文稿写入，全部 200，浏览器错误、HTTP 失败和语音生成请求均为 0。
它验证保存调度与显式入口，没有复测操作系统输入法、视频播放或四组合外观；本次没有外观改动。

首轮脚本沿用旧状态断言，只接受 `data-save=saved`，在新文稿实际 `idle` 状态停住，0 输入、0 写入。
该记录及截图另保 `document-save-debounce-initial-status-harness.*`，最终改为读取当前 `idle/saved` 状态，产品未为此修改。
最终截图为 `document-save-debounce-final.png`。
候选源码 SHA 与自有服务、浏览器、workspace、home、fixture 清理结果都在原始记录中；所有清理项为真。
没有新增 tracked tests 或运行测试套件。
