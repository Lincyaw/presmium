# 原生新建批注草稿恢复

本片从 `31e99713` 实现尚无 thread ID 的原生 composer 备份，另含已经独立交付的 clean ACK gate 与 source-ready reader 修复。未提交内容使用同一个 Workbench `CommentDraftBank`／strict IndexedDB owner，不写 `lecture.json`，不创建假线程，也没有第二 canonical writer。MCP 仍不能读取或恢复这些客户端字节。

## 公开原生边界

公开 `FloatingComposerController.floatingComposer` 交给适配层实际 `newCommentEditor`；公开 `FloatingComposer`、`Comments.Editor`、`CommentEditorSubmitExtension` 保留原表单和 Save。创建意图记录可信 workspace/document/member、原 source version、稳定 anchor 和选中跨度内各可寻址实体的完整文本签名。锚点沿同一 canonical anchor v1 与现有 native projection 校验，不扫描 opaque payload。

恢复必须明确选择。先确认当前输入已经 strict 提交，再 fork 所选稿；每次 await 后复核存活 owner、source、原生 doc/selection、位置 token、最新输入与主编辑器／composer IME。精确 canonical/native 范围均成立，才用一次公开 `editor.transact` 与 `@tiptap/pm/state` 的 `TextSelection` 恢复原范围，不读写 DOM Range，不要求作者重新手选。成功后只收起批注侧栏，让窄屏上的原生浮层可用。范围内容改变、消失或不可寻址时只提供原生只读取稿与精确丢弃，不夹紧或改绑。

原生 Save 仍立即建立真实线程并由 BlockNote 挂 mark；备份只记录实际线程／评论 ID 和创建时间，原 actor 保存后再按 clean canonical 的正文、身份、时间与原 anchor 确认退休。晚 ACK 不能清后输入，真实 413 不表示成功。关闭仅隐藏表单；精确丢弃已关闭最新稿 B 后不会继续用已消费 B 阻止恢复 A。

备份 admission 沿原 `1 << 20` UTF-16 serialized 限额。超限时最新完整稿留在同一 session owner，明确显示“仅本会话”，可只读取回，不能绕过 strict 门槛恢复或向 IndexedDB 写入超限正文。`DocumentSession.flush` 仍只确认 canonical 编辑，不代表未提交 composer 已 Save。

## 分轮实际证据

原始记录在本 WT 的 `.presmium/native-new-comment-drafts/`，不把多轮累计为一次验收。

| raw 目录 | 实际范围 | 结果 |
|---|---|---|
| `before-1793138560123` | 原生新建稿关闭、切 B 回 A、reload，无 canonical 写入 | observation 4/4，原行为丢稿 |
| `after-first-1793139286554` | 首版三条明确恢复，最后原生 Save | 5/5，真实新线程的 anchor 精确为原 `body-edit[0,6]` |
| `discard-before-1793141634999` → `discard-after-1793141711378` | 两个真实不同范围 A/B，关闭 B 后精确丢弃 B，再恢复 A | before/after 各 5/5；前者 `productCorrect:false`，后者恢复 A，无发布 |
| `four-combo-final-1793142204855` | 1440/390 × light/dark，关闭后恢复并真实续写；最后 native Save 与 clean ACK 退休自己 pending | 7/7，四张恢复图逐张看过，表单可见可操作 |
| `target-after-1793142065670` | MCP 实际修改原范围文本，再删除原稳定节点 | 4/4，只读取稿／恢复禁用／短诊断，没有接到别处 |
| `create-ack-after-1793142333832` | 真实 A200 已提交但 held，B strict pending 后释放 A，B 实际 413 | 6/6，B 原字节仍可完整取回，canonical 没有 B |
| `late-boundaries-1793142509658` | 实际 IDB 事务阻塞恢复，后来正文 CAS 优先；原生 Chromium 中文 compositionstart/end 后关闭恢复 | 5/5，旧恢复不抢输入，原稿保留，中文未自动发布 |
| `session-admission-1793142653849` | 原生输入 1,050,026 字符，关闭后 session 只读取稿 | 5/5，原生 textContent 与取稿 SHA 都为 `62d6605275f821142c20ac94980bd0c45deab09cb35b2c193f1e91e3b110f038`，未超限写 IDB／canonical，strict 恢复禁用 |
| `main-ime-final-1793142803970` | 最终主编辑器 IME 守卫；strict fork 等待期间后来正文预编辑，释放后不打断，最后原生提交真实保存 | 5/5，原稿精确保留。该链也改变了原生 doc/selection，不把它称为 composing 守卫的独立反例 |

A/B 413 使用真实合法 `metadata.presmium.audit.padding` 将私有 source 接近 2 MiB；它未渲染或编译，UI 中 A/B 是正常带空格的短段落。不 mock 后端，不把此链称为一般大文渲染验收。1 MiB 稿是单个纯文本段落，不含换行；比较完整 textContent 与 UTF-8 SHA，不将布局生成的 innerText 当结构化内容。没有验证真实磁盘 quota、物理中文键盘、断电或所有浏览器。

四组合、ACK、late、admission 的 map 各 13 路径：9 个修改运行源和4个原基线；target 的旧 map 是12路径，未含 DocumentView，因此不声称该轮覆盖全部9源。最后仅 `NewCommentDrafts.tsx` 增加 entry/await 后主编辑器 composing 守卫；逆这两处条件可精确还原前述已通过各轮的 New module SHA，其余8源不变。最终 IME 5/5 的13路径与提交运行源码一致。精确 raw/source SHA、逆补丁证明和逐 PID 清理索引保留在 ignored `final-manifest.json`。

`final-matrix-1793141981098` 另有8项完成关闭／切文稿／reload行为；它的12路径同样未含 DocumentView。更早 `after-first-1793141839276` 虽8项通过，亲看图发现390恢复表单被仍打开的 sidebar 覆盖，未作为视觉通过；后来成功恢复才收起 comments aside。旧记录均保留。

保留的未完成记录：首次 inactive 候选控件缺失定位到共享 reader 未在 loading 后启动，已由[独立 reader 修复](comment-draft-reader-start-2026-10-28.md)在现有 reply 基线上实际 before/after；一次只读 helper 依赖 require 错位未运行读探针；target 首轮撞上 BlockNote outer/container 同 data-id 的 observer strict locator；late 首轮第二个中文浏览器仍找英文 Add comment；admission 首轮用 hidden 原生浮层的 innerText（实际为0）错误判断字节。原 raw 不改写为绿。

两次 ACK 窄链的无空格 B 将原生 FloatingComposer 撑至约30,615px 宽并被 FloatingUI 隐藏，尚未发 B 请求；同字数改正常带空格文本才完成后端413证明。1 MiB 原生输入也因依赖浮层高度被隐藏，但完整文本存在，关闭后只读取稿可见。排版限制另交公共 BlockNote 适配层，不在业务 CSS 绕过；这些失败不计入正确恢复验收。

设计复用既有 I01 `241:843` 与原生 FloatingComposer。实施前读取 `figma-design-to-code`，以原团队账户实际建立 session `093bd690-c36c-482b-b45c-e9dd164a7cb9` 并读取 design context 和截图；未新建节点、CSS、令牌或素材。公共恢复控件仍为 PmNotice/PmSelect/PmButton。

全部是私有最小文稿，0 模型／ASR／TTS，未准备 IR，未碰公共端口。自有浏览器、client、backend/frontend、home/workspace/fixture 全清。轻检为 types1276、layering、skills、packages 和 diff；未新增 tracked tests，未运行套件。
