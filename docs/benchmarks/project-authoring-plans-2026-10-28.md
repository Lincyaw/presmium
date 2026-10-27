# 项目管理的固定计划与共享提交

基线为整合提交 `b25c4861be155b7538705c470fa32969be61e1af`，包含失败保护 `fa521846`。本片仅在独立 `project-authoring-plans` 工作树运行，未改公共 4320／17407、作者文稿或原 safety 工作树，未调用模型、运行套件或新增 tracked tests。

## 行为与范围

普通文稿的新建、复制、目录移动、删除，以及首页的标题重命名，共用 `ProjectAuthoring` 的 capabilities → plan → apply。目录写入由原 `DocumentOperations`／`DocumentWriter`／`Revisions.transaction` 和文稿锁负责；后续[标题 CAS 增量](project-retitle-canonical-cas-2026-10-28.md)已把 retitle 交回原 DocumentEditor 的 canonical 事务。项目预检不读 IR、不编译、不播放。原 `POST documents` 裸操作返回 `409 project-plan-required`，Web 也不能绕过计划。

能力只观察实际 HEAD 和工作区配置，`verification: configuration-only` 不代表文件树验证。目录操作对无 Git、无可确认 HEAD、单文稿工作区、非 editor、文稿绑定令牌或 agent 的 operate／required-review 门槛如实拒绝；标题动作按后续增量单独报告能力，单文稿／无 Git 可编辑标题，文稿绑定令牌只可修改本目标；根文稿 `''` 是合法身份，但复制／目录移动／删除仍不可用，其工作区控制文件范围尚未定义。本片不宣称全部项目管理 parity 完成。

计划绑定实际 HEAD、原始配置字节和已加载配置、受影响目录的真实文件树、所有 served canonical 引用、既有 Markdown relink 输入及真实模板。新建／复制在预检时固定新文稿 UUID，内部 Block／Section／Step 等合法 ID 保留。标题重命名保留文稿 UUID（现由 canonical source CAS 绑定，不依赖目录 HEAD）；复制标题在同一提交内写入。写前在原 Git 队列与工作区锁内复核，避免外层再次拿同一队列而自锁。

计划和回执按成员及可信 origin 隔离，模型不能提交 origin 或伪造 workspace grant。MCP 的 `caller.document` 是绑定令牌范围，即使是 `''` 也不能冒充工作区授权；普通工具参数没有替代这一授权的 document 字段。HTTP 作者入口由闭包固定 editor，MCP 固定 agent，保留 launcher token、角色、operate 和 required-review 边界。

素材 location、definition 的 file implementation、正文／图片说明／批注中的 typed href 及翻译入口按文稿相对路径处理；官方 region／symbol／pattern 代码锚点按逻辑 workspace 根处理，带外部 repo 的锚点不改。只修改这些字段，不递归替换任意字符串或插件 data。目录重命名的已知跨文稿引用一起更新并备份；删除有 incoming 引用时拒绝。copy 保留本地 pinned 代码锚点与变体的原 anchor／pin 组合，继续读取旧提交的真实原路径；rename 触及本地 pinned 路径时返回 `project-pinned-anchor-rename-unavailable`，不会改 pin 或强行生成新 HEAD。普通 unpinned 锚点仍重写。操作自身的未知本地代码锚点在复制／目录移动时明确拒绝；这不是任意私有路径检测器。URL 中的远程地址、根绝对路径、hash／query 原样保留。opaque／component parameters、definition.data、插件 metadata、JS／TS 场景代码及其中的外部 relative imports 不解析、不改写，也不据此拒绝，仍随原文件字节复制／移动；它们在新位置的依赖语义不在本片保证范围。不能把这种原样保留说成私有引用已安全改写或相关项目被禁止。既有 Markdown relink 也不等于通用 Markdown 兼容。内部 symlink 保留原链接字节，外部链接、目录 symlink、嵌套 Git 与不支持的文件种类拒绝。

`impact.files/bytes` 是操作根的文件／链接数量和原字节数，不是全部扫描输入、输出字节或跨文稿改写总数；`referenceDocuments` 单列实际会改写的其它 canonical 文稿。删除弹窗打开后先只读预检，显示将删除的真实文件／链接数，原删除按钮只提交这份 planId／digest。源发生变化不能借一次旧确认删除新状态。

限额是 4,096 UTF-16 请求字符、7,168 响应字符、64 个进程内计划、五分钟有效期；文件树沿用 16,384 项／512 MiB 备份门槛，canonical 改写最多 16 文件／2 MiB。超限结构化拒绝，不偷偷漏文件。没有无限清单或隐式翻页；项目列表仍是既有独立入口。回执中的 revision 明确是有界摘要，`revisionTruncated` 与原文件总数表明省略；完整历史另由已有历史读取接口提供。

同计划并发提交共用一次进行中的工作；已知回执只在实际结果 HEAD／tree 仍当前时重放。Undo 回到旧基线不会让同意图再次执行，不提供持久幂等或无限 ABA 保证。提交后的读回失败报告 `committed:true`，不在原事务内抛出错误而把新 HEAD 配上旧 index；提交状态未知或回滚自身失败仍沿用 safety 片保留恢复材料的行为。未保存客户端草稿不属于服务端项目快照，不能据此宣称恢复或跨浏览器草稿同步。

## 实际记录

证据在 ignored `.presmium/project-plans/`，最终 `final-manifest.json` 保留每轮 raw、起止源码 SHA、当前匹配和资源清理，不把不同阶段相加成一次全绿。

| 材料 | 实际范围 |
| --- | --- |
| `node-1793138021367/result.json`，11/11 | 实际 Node owner＋私有 Git：固定创建 UUID／重放、复制 binary 与内部 symlink、目录移动、标题重命名、明确删除、tree 变化、root／文稿绑定范围、真实 index.lock 回滚；读取九份导览和 libraries 分类引用。不是实际构建／复制全部示例 |
| `references-1793138415977/result.json`，12/12 | 实际跨文稿 Asset／file implementation／href／代码锚点；文字 literal 不改；真实 Git 拒绝时目录与其它 canonical 一起恢复；staged-only 引用文件拒绝；真实 HEAD／配置／锁／角色／无 Git／预取消边界 |
| `studio-1793138245594/result.json`，12/12 | 官方 MCP SDK＋真实 HTTP＋原生首页创建／标题重命名／复制／删除。旧阶段删除在点击后才预检，未作为最终精确影响确认的证明 |
| `studio-1793138828801/result.json`，14/14 | 最终 UI 阶段：实际签发的文稿绑定 MCP token 拒绝项目操作；HTTP／MCP 同 owner；原生首页动作、先 plan 后明确数量确认；真实 apply 响应已 200 后丢 ACK，原生再次复制复用同 plan／UUID 且 HEAD 未增加第二提交。四份截图为英文删除弹窗 light／dark × 1440／390；无模型、外网、pageerror 或观察器 route 错误 |
| `references-1793139075285/result.json`，12/12 | 最后仅补 Plan 返回字段 `referenceDocuments`，实际重命名确实列出 two；同窄协议在最终源码再验。该增量不冒称早先四图和 14 项都运行于最终全部源字节 |
| `node-1793139094393/result.json`，4/4 | 实际 64 计划容量；异 payload／异成员拒绝；私有 Git Undo ABA；真实模板新增文件后旧计划拒绝 |
| `node-1793138743017/result.json` → `node-1793138753747/result.json` | 新候选的真实省略 title 反例曾回写 `{{title}}`；统一 basename 后独立 1/1，通过且新 UUID 与计划一致 |

引用观察器首轮漏把新增 code block 加进 section，canonical 本身无效，修正后才跑引用行为；其 raw 未覆盖。容量观察器首轮缺 cpSync import，第二轮尝试 post-commit hook 没有制造预期故障：kernel 的公开安全 Git 配置固定 `core.hooksPath=/dev/null`。保留 partial raw，不把缺少拒绝当产品故障或声称已验证该读回失败分支，也未放宽 Git 安全配置。最终四项重新独立完成。一个 default-title 观察器最初变量重复声明，在创建资源前即语法失败；随后真实失败／通过分列。

Figma 以已选 cyaw／lincyaw 文件读过 P01 项目列表与 I01 公共状态，沿用正式 PmDialog／PmMenu／PmButton，没有新增视觉控件或业务 CSS。四图已实际查看，弹窗与数量可读；背景首页列表原有左侧裁切在截图可见，本片不称整个首页布局无问题。未把 390 宽度等同真实触屏输入验收。

类型、分层、令牌、技能、包结构和 diff 轻检按 manifest 记录。所有私有服务、浏览器、临时工作区与任务凭据均清理。未验证外部多进程 Git 并发、断电恢复、全部文件系统元数据、跨工作区根目录语义、实际等待五分钟过期或任意插件私有引用；完整文件树上限也不是大型工程性能验收。

## pinned 锚点窄增量

root 复核后另有一个已支持 typed 字段的真实反例，不能归入插件私有范围：`references-1793140069394/result.json` 中旧提交 P 真实含 one/implementation.ts，copy 后错误重写 anchor 至 copied/implementation.ts 却保留 P，Git 读取旧路径成功而新路径不存在（counterexample 完成不代表产品通过）。修复只在本地已识别路径受到操作影响时处理 pin：copy 保留整组 tuple；rename 明确拒绝；delete 的 incoming-ref 拒绝保持原样。

`references-1793140461964/result.json` 独立 4/4：真实 copy 后主锚点／变体 tuple 完整不变、旧提交原路径可读；rename 拒绝且文件／HEAD／index 未写；普通 unpinned copy 仍重写到实际副本。最后以公开 presmium check 检查仅该 copied 文稿，真正装入 addon-code，退出 0。没有整示例构建、服务、模型或新 tracked tests，私有临时根全清。此增量不重称原 Studio14 已在新字节运行。
