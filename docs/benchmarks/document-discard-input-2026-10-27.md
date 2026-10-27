# 弃用草稿的迟到读取与后续输入

在 `25b43c51` 的独立 worktree、随机实际端口的私有 Studio 和两份私有文稿上验证。公共服务、作者文稿、制作参数草稿与录音未参与。

## 原因与修复

作者恢复未保存草稿后点击“丢弃草稿”，读取期间仍能继续输入。原 `DocumentSession.discard` 等待读取和摘要后直接替换正文并删除存储记录，没有确认操作发出后是否已有新输入。

真实 before 先断网使正文 POST 失败，再重载并重新打开同一文稿：恢复正文为 `Canonical alpha BEFORE`。暂扣真实后端 GET 200 时继续输入，原生正文与 sessionStorage 均为 `Canonical alpha BEFORE AFTER`，input 修订增长。释放回应后，原实现把正文改回 `Canonical alpha`，草稿记录被删除；磁盘规范文稿始终未变。

修复仅在 `DocumentSession.discard` 捕获 slot、文稿身份、input 与 read 操作代次；读取后、摘要后和异常分支检查它们以及 dispose、组词和写入状态。输入或操作已变化时，旧回调不再替换正文、清草稿或发布旧错误。实际返回的目录或 UUID 不符时保留原 slot 和草稿，复用已有身份冲突诊断。没有修改控件、保存时机、服务契约或持久化范围。

## 真实结果

| 原始记录（本 worktree `.presmium/ui-evidence/`） | 结果与边界 |
| --- | --- |
| `document-discard-before.json` | 6/6 缺陷观察；确实丢失读取等待期间的新输入，不是保存成功 |
| `document-discard-after.json` | 同链 6/6；真实旧 GET 释放后，原生正文与完整草稿保留，磁盘未写 |
| `document-discard-boundaries.json` | 12/12；含同链、实际浏览器摘要结果暂扣期间继续输入、真实坏 JSON 的 GET 422 迟到异常、健康明确弃用、服务器 UUID 替换拒绝 |

GET 用 Playwright `route.fetch()` 取得实际服务结果，只延后交付，没有伪造后端回应。摘要边界通过公开 `crypto.subtle.digest` 委托真实浏览器摘要计算，暂扣其结果以构造交错；它是定向调度验证，不是摘要性能测量。422 来自短暂写入私有文稿的实际无效 JSON，取得回应后立即恢复原字节，再继续原生输入并释放错误。错误到达后，恢复 Notice 与新草稿都保持不变。

UUID 边界实际替换私有源的 UUID 与正文，确认旧身份的原生内容和草稿未被新文稿填入。健康对照则确认没有后续输入时，“丢弃草稿”仍能采用真实服务器内容并清除该草稿。

各轮均无浏览器异常和成功的正文写入。before/after 各一次有意的离线保存失败；边界轮有两次离线保存失败和一次实际 GET 422，其余 HTTP 无失败。两张 before/after 截图已逐张查看。原先两次消费者错误分别误等省略的 `aria-busy=false`，以及在重载后停于 Home 时直接寻找正文，保留在 `document-discard-before-bootstrap-{ready-oracle,home-reopen}.*`；未修改产品来适配这些条件。

最终 `document-session.ts` SHA 为 `5be6cf1945251100c1f2b09aa8c794fb9e3a6608207e8c3956962605ae884980`，三轮相关源码起止 SHA 一致。类型检查通过 1223 个文件，diff 检查通过。每轮浏览器、后端、前端、私有 home、workspace 与 fixture 均在 finally 清理；独立最终 manifest 另核实际 PID 已退出。

未新增 tracked tests，未运行套件、模型或四组合矩阵。本片仍使用 sessionStorage，不宣称解决关闭标签页、浏览器崩溃或跨标签页的持久恢复。
