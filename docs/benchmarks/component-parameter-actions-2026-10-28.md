# 组件参数与已有 Definition 作者动作

2026-10-28，在隔离 worktree `mcp-component-actions` 完成共享作者服务的参数动作首片。服务首提交为 `af1bc36c0d86c2f82733738d7ad41c5b2c0c6493`，最终守卫提交为 `f9eae4380444b6d9788969dac7a71969f63667d9`。基线 `c9064468`，依赖与共享 Schema 校验来自 `494dbc0c`、`c3a9f68c`；公共字段／只读访问能力来自 `733f3262`（本 worktree 映射为 `bb6a47b8`）。本记录只证明领域服务、HTTP 和 MCP，不把另行实施的表单交互算入本轮验收，也未公共部署。

## 实际范围

四个动作进入原 `DocumentEditor` 的计划、CAS、锁、事务、历史、回执和读后核验：基础参数修改、稳定步骤参数覆盖、恢复当前步骤参数继承、当前实例改用已有 Definition。共享纯函数是 `applyDocumentComponentAction`、`effectiveComponentParameters`、`createDocumentParameterChanges`。它们不编译场景、不装配 Node 服务、不调用模型。

参数路径只属于目标实例的 `parameters`。实际变更交给公开 `fast-json-patch` 3.1.1；对象／数组可作为完整字段值，数组项可替换、移除或在末尾追加。请求不回传未变的大字段。步骤修改先读有效参数，再仅物化被修改的顶层覆盖；其后继继承步骤可能受影响。重置只删本层 parameters，保留 visible、state、inherits。若原来没有 VisualState，新增本层参数必须同时固定契约要求的当前有效 visible，不改变此时的可见状态。浅覆盖无法表达“屏蔽继承字段使其不存在”时明确 422，不伪造 null 或删除基础字段。

已有 Definition 选择只改当前实例的 definitionId 和显式请求参数；其它实例、实现文件、原资产及不透明数据保留。完整文稿及有效参数／状态重新验证。独立实现副本仍准确 unavailable：现有 bundle inputs 是整文稿运行依赖线索，并非内容哈希绑定、包含 CSS／媒体／动态依赖的独立实现闭包，不能用只复制 Definition 或单个 TSX 冒充独立素材。

HTTP `document/action/apply` 由可信适配器固定 editor origin；MCP 固定 agent，仍受 required review 和 operate 限制。调用者无法在 payload 伪造 origin。HTTP 保留完整 plan/effect；MCP 只回紧凑计数和引用，完整影响列表由 `read_authoring_action_impact` 或同作用域资源按页读取。新增 `GET document/capabilities` 复用同一服务，包含独立副本不可用原因。

## 真实私有消费

忽略脚本 `.presmium/mcp-component-actions/consumer.mjs` 使用公开 `serveWorkspace`、官方 MCP Client、真实 HTTP、Git 历史与实际 DSH wrapper/result-pruner。工作区有两份真实文稿、两个共享 Definition 实例、五个显式继承步骤、超过 4KB 的未知参数及一个若被编译即报错的本地实现文件。没有 Studio、浏览器、模型、提供方或显式 IR 请求。

首轮 `.presmium/mcp-component-actions/run-1793149872637/result.json` 在 11 项通过后以 400 停止：观察器沿用了旧 history/undo 请求，缺少现行 snapshot/source/id。这是未完成记录，原 raw 保留。仅按当前 `DocumentHistoryChange` 修正忽略脚本，没有修改运行源码。

第二轮 `.presmium/mcp-component-actions/run-1793149902271/result.json` 完整 **16/16**，SHA-256 为 `c035c42cdf9cf833ce0850cb402e966d0e78d8891161614375315ad040ae88c2`：

- 并发同意图预检固定同一计划且不写文件；基础 config 修改实际影响 A/B/E，被 C/D 覆盖遮蔽，另一个共享实例和巨大未知字段不变。
- 实际服务完成提交后丢弃 ACK，同引用重试只增加一个 Git commit；回执的版本与完整 canonical 候选读回一致。
- HTTP 与 MCP 采用同一计划，分别记录 editor／agent；required review 阻止 agent，但不阻止可信人工 HTTP 编辑，origin 注入被拒绝。
- 步骤数组子字段修改、移除和追加保留其它数组项的大型未知对象；只物化被修改的顶层 values。明确恢复删除当前参数覆盖，保留可见性、状态和继承。
- 已有 Definition 选择保留其它实例与原实现字节；状态不兼容、未知引用、错页步骤、错误块类型、Schema、坏数组索引、缺失路径、prototype 路径及不可表达的继承删除均拒绝且不写。
- 已编辑值超预算返回带 limits／下一步的 413；保留参数再大也不要求模型回抄。后来正文造成 409，原输入保留；旧影响资源准确标 old。原历史 Undo 恢复完整源，旧成功引用在 ABA 后拒绝。
- 公开 pure diff 的数组插入及短字段修改与真实 reducer 结果完全一致。

最后使用 500 个额外继承步骤，共 **503** 个实际受影响 StepID。真实 DSH result-pruner 阈值 8192 字符；plan 为 1615、apply 为 1344 个 UTF-16 字符。影响分三页 **7151／7149／1878**，按真实转义后的 wrapper 文本测量，全部保持有效 JSON、未被剪裁，拼接严格等于完整 HTTP effect。资源与工具读到相同首片。请求最大 4096、结果上限 7168，未用估计尺寸替代实际序列化检查。

第二轮登记 **15** 个源路径起止一致：12 个本片运行源，加共享 `parameters.ts`、`document.ts` 和锁文件三个基线。不是 15 个本片修改文件。原实现文件 SHA 前后相同；所有客户端、服务、pruner 资源关闭，私有工作区移除，消费者进程已 exit 0。

## 独立只读注解反例

上述 16 项后的第三方源码审查发现，JSON Schema 的 readOnly 是注解，不会由 CFworker 自动拒绝修改。独立真实 MCP 反例 `.presmium/mcp-component-actions/run-1793150255078/result.json` 完整 1/1 确认：基础 Schema 的 locked.readOnly=true 仍可被当时的语义动作修改并保存。该记录是产品反例，不算正确性通过；运行源仍为 af1bc36c，资源已清。反例 SHA-256 为 `0c64318c818c3e6b64915ce6d4a5f5bb938e76fd027a9bb557bbaa98d9e4fe2d`，不改写原 16 项的源码谱系。

## 最终公共字段与只读守卫

共享 `documentParameterAccess` 使用成熟 json-schema-library 11.6.16 的公开解析，CFworker 继续验证原 Schema。false 注解只在独立访问视图中正规化，不能抵消另一适用分支的 true，不改作者 JSON。动作规则先由成熟 RFC 6902 diff 确认实际改到的顶层字段，再核前后值及适用基础／有效 state Schema 的公开路径、只读祖先与后代；未声明字段不从现有私有数据猜成可编辑。普通父对象替换／删除不能丢未知后代或绕只读字段。新 Definition 只重新绑定且没有参数变化时，不把保留数据重新当成用户输入。

数组保留原能力：公开整项删除允许该项的未知与只读子数据随项退役；纯重排必须保留完整项的精确 multiset，不猜 id 字段。显式 remove／append 的索引位移仅以本次纯操作的短期 index mapping 解释，不是队列、持久账本或新写入器。不明 whole-array 重排混合字段修改准确 unavailable，提示分开采用。恢复继承不进行不明重排推断，仍逐字段检查真实只读／公开性，不能借 reset 改只读值。只读错误、未知路径和复杂度失败均带有界诊断，拒绝时 canonical 与 Git 提交数不变。

守卫增量中的真实记录分列：

| raw：`.presmium/mcp-component-actions/` | 实际结果／源码边界 |
| --- | --- |
| `run-1793151173276/result.json` | 直接只读反例 after 1/1，SHA `b311e73b3a81c284818818d6d4fe28e7e027a30bae037baa17efdb6592704209`；这是首版守卫，非最终全源。 |
| `run-1793151264887/result.json` | 首版守卫 21/21；后续发现对原数组操作和恢复继承的过度拒绝，因此不称最终完整验收。 |
| `run-1793151475976/result.json` | 原链重查 4 项后失败：显式数组修改／删除／追加被误报 mixed。保留原 raw。 |
| `run-1793151536603/result.json` | 修显式位移后重查 5 项后失败：恢复当前覆盖仍被误报 mixed。保留原 raw。 |
| `run-1793151658952/result.json` | 最终服务链 **16/16**，SHA `a4d43d3bd595b3f5c37431b0970f2cd11ebaec7c49bf78c595f595f72b0d035c`。与当前 15 个登记路径全部匹配。 |
| `run-1793151667398/result.json` | 最终守卫 **22/22**，SHA `d3df94766949980800e4f41a1bf1429ee6ab5457857d47114cc7359f1be29381`。16 个登记路径起止与当前一致，比服务链另登记 kernel package.json。 |

最终 22 项实际包括 direct／allOf true 与 false、只读父／后代／state／reset、未知原字段与新字段、父替换丢未知字段拒绝；正常步骤修改保覆盖，整项删除含未知／只读子字段，完整数组纯重排、不明 mixed 拒绝、typed additionalProperties、本地 ref、转义字段、已有 Definition 保留绑定、新数组项与不可夹带的私有子字段，以及公开 pure diff 对只读项的重排／中间插入。全部使用真实服务和 MCP，无 mock。

最终服务链再次使用真实 DSH wrapper／pruner：plan **1618**、apply **1344**，503 个影响 ID 分片 **7151／7149／1878**，均未剪裁并可精确重组。它覆盖最新守卫源码，不借首版 16 项声称最终字节已验。两份最终 raw 的 sourceStart／sourceEnd 都精确匹配当前源码，所有私有服务、MCP 客户端、pruner、临时工作区已清，进程 exit 0。组件归属查找现在公开为 `documentComponentSection`，只接受真实组件块并复用原规范树归属规则；没有新文件路径能力。

## 检查与未验范围

最终 `check-types` 1292 文件、layering、skills、packages、diff 检查通过；第一份类型日志中的 erasable syntax 参数属性错误已改为显式字段，保留原失败日志。没有新 tracked tests，也未运行套件、完整示例构建、模型或公共服务。

本片没有 Definition 实现闭包复制、修改共享实现、删除 Definition、通用大文写回、素材字节替换或全部 MCP parity。Web 表单的原生输入、焦点、恢复与视觉验收由界面片单独记录。幂等边界仍为原进程内五分钟、64 plans／64 receipts 和 current-source；不承诺进程重启后或所有记录遗忘后的无限重放。
