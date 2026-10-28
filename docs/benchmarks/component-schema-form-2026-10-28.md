# 公共参数表单：2026-10-28

当前版本使用公开 RJSF 6.11.0，稳定联合分支、去重和私有字段边界见末节。前面的 5.24.13 记录按提交阶段保留，不代表最终依赖版本或完整联合结构支持。

本片提供 `@lincyaw/workbench` 的受控 `PmSchemaForm`、公开字段名查询，以及 `@lincyaw/kernel` 的 `validateDocumentParameters`。调用方继续持有目标、草稿、来源版本和应用事务。本片没有把属性入口接入文档，也不宣称共享定义编辑或 MCP 只读字段限制已经完成。

表单使用 RJSF core/utils 5.24.13 的公开根入口与 fields、templates、widgets，组合现有 Pm 控件。CFworker 4.1.1 是文稿及表单的唯一有效性校验器；分支引用通过公开根资源注册。首次渲染不产生变更或填充 default。未知数据不显示为私有字段，实际编辑保留它们；无公开 properties 的对象显示空参数状态。只读、禁用、嵌套对象、数组操作、枚举、布尔值、局部引用和 oneOf 选择经过真实操作。

未完成数字以 JSON 字符串交给调用方并保持无效状态，不能因为当前无效就丢弃输入。调用方以目标／来源身份重置组件；`hideProperties` 只隐藏字段，不删除值或约束。基础与步骤 schema 分别校验同一值，保持各自的引用根；`extraValidation` 接收额外结果。公开字段名查询遇到尚不能从保存值确定的顶层联合结构时返回 unavailable。文件等未提供的控件明确不支持，不将本片称为任意 JSON Schema 表单实现。

Figma 读取 `ComponentProperties` 的 Compact Base `278:5411` 与 NoFields `278:5499`，使用已选 cyaw／lincyaw 文件；组合的完整设计登记由设计片维护。公共 CSS 只补表单与数组排列间距，未覆写已有控件。

## 实际验证

忽略目录 `.presmium/schema-form-verification/` 保存临时 React 消费者、执行脚本、原始结果与截图。它用公开包入口构建，在私有随机端口运行真实 Chromium；无模型、作者文稿或公开服务写入。

| 证据 | 实际结果 |
|---|---|
| `run-1793150049117/result.json` | 最终 30/30，包含首开无变更、unknown／readOnly 保留、嵌套 `$id`／`$defs`／`$ref`、oneOf、数组增删排序、转义字段、数字未完成输入、独立额外约束、mask、目标重置与真实 CDP 输入法预编辑／提交 |
| 同目录四张截图 | light／dark × 1440／390 实际查看；验证视口适配，不冒称物理触屏验证 |
| 同目录 sourceStart／sourceEnd | 1182 个登记运行输入起止相等且与最终提交前源码一致 |
| 同目录错误与清理 | console／page／HTTP／external 全空；浏览器、私有服务器关闭，无 canonical 文件写入 |
| `rjsf-root-5.24.13.json` | 公开根入口真实 browser build，579 输入，无 AJV 或额外 validator 输入 |

原始失败均保留：6.11 根入口构建缺少 dev-only `@rjsf/validator-ajv8`；内部子路径仅探索，未交付。原 oneOf 分支保留错误以公开根 schema scope 修复。`run-1793149955003` 的 30 个行为断言虽通过，但出现 16 条 React 更新深度警告，不能记作 clean；最终以语义相等的 validation 通知去重消除，再将 console 纳入失败条件重跑。`run-1793149729151` 为先前 21 项清洁基线，不冒充最终源码证据。

独立 peer 只读全部六模块、导出和 CSS，给出 scoped APPROVE；未另起消费者。轻量检查与精确提交字节证明登记在同目录 final-manifest.json。未运行测试套件、示例全量构建或公开部署。

## 共享参数访问能力

随后独立增加 `documentParameterAccess(schema, value, path)`，返回 `available`、`public`、`readOnly` 及有界失败代码。它通过 json-schema-library 11.6.16 的公开 `compileSchema`、`getNode` 与 `reduceNode` 获取明确 schema 路径及只读祖先，固定本地 draft-2020-12，不注册远程 loader。显式 pattern／additionalProperties 的 schema 也属于声明；宽泛 object、缺少 item schema 或未声明键不从当前数据推断为公共字段。引用缺失、分支不确定、非法 schema 或解析限制返回 unavailable。单次路径最多 64 层，schema 注解遍历最多 64 层／50000 个 schema 节点。

该库的原始 `getNode` 在 `allOf` 中会以后面的 `readOnly:false` 覆盖前面的 true，公开 `reduceNode` 同样如此；默认 validation 注解不收集只读，扩展注解 hook 在 anyOf／引用旁注中也未完整收集。原始反例保留，未作为权限判断交付。最终仅在私有 schema 副本的标准 schema 位置移除 false 注解：false 表示没有只读声明，不能撤销另一适用 schema 的 true。default、const、enum、examples 等数据未改；引用、分支、约束仍由库解析，作者 JSON 不回写。CFworker 的原始 schema 完整校验保持不变。此能力不是手写通用 resolver，也不代替动作 owner 对变更叶子、数组操作和前后两个有效 schema 状态的检查。

| 忽略证据：`.presmium/schema-access-verification/` | 实际结果 |
|---|---|
| `probe-1793150679251.json` | 原始库 26 项中 24 通过；保留 allOf 顺序覆盖与根未 reduce 两个失败 |
| `annotations-1793150706715.json`、`annotation-extension-1793150751991.json` | 公开注解接口不足的原始材料，未采用该方案 |
| `normalize-probe-1793150798357.json` | 13 项窄探针通过，含两种顺序、ref 旁注、未选分支及数据不变 |
| `consumer-1793150910229.json` | 实际最终 helper 52/52；四个运行源起止一致，无作者数据变更；单次查询最大约 3.2ms，仅作本地观测 |
| `../schema-form-verification/run-1793150917330/result.json` | 加入新依赖后公开根入口构建及真实浏览器再验证 30/30，1182 输入起止/current 一致，错误为空，浏览器和私服全关闭 |

最终类型检查 1302 文件通过。参数访问片的 manifest 与精确提交证明单独登记，不把新增依赖后的结果冒充此前公共表单提交时的冻结字节。此处不宣称参数动作的端到端只读门禁已经接入；后者由领域动作片复用本函数并独立验证。

## 表单字段的统一访问限制

再以独立片把同一个注解视图与访问函数接入公开 SchemaField。`accessorSchemas?: readonly JsonSchema[]` 提供额外的独立 schema 根：任一根声明路径即可属于 public，任一适用根声明只读即只读；额外根不可解析则保留当前值并显示短只读状态。表单展示和原生 readonly／disabled、数组操作与回调门禁一致，原始 schema 和额外 `extraValidation` 的完整 CFworker 校验不变。

无效草稿不会自动冻结：库的 oneOf／anyOf 数据选支错误以 `value-unresolved` 区别于 schema／引用失败，后端仍收到 unavailable。只有公开 RJSF SchemaField 已显式选择的 UI 分支、且原始 CFworker 校验器可用时，表单才继续该分支的输入。没有生成猜测值、保存 last-good 副本或改变源数据；空数字分支和 `-` 均可补填、修正或切回。真正 schema／引用错误维持只读。注解视图也修复标准 allOf-only 根被原 adapter 显示为空的问题，公开字段查询同步使用相同视图。

忽略证据在 `.presmium/schema-form-access-verification/`：

| 原始记录 | 实际结果 |
|---|---|
| `before-1793151262822` | 首次定位 allOf-only 字段超时；其原始页面显示空参数，保留未覆盖的事实 |
| `before-1793151363123` | 7 项 expected-counterexample；allOf、ref sibling、状态 schema 与父对象的四个原生输入都可编辑，真实 fill 改变草稿 |
| `after-1793151534884` | 同四个输入恢复原生只读，7 项通过；不是最终源码谱系 |
| `after-expanded-1793151653215` | strict locator 因实际 anyOf 重复同 ID 控件失败，原始红结果保留 |
| `after-final-1793151765301` | 最终 21/21；全部出现的只读控件均阻止真实键盘输入，状态数组动作禁用，坏引用保值只读，allOf-only 正常出现，union 空分支／`-` 可修正并切回，unknown 不丢；明暗 × 1440／390 已看 |

最终同源复核包括公共表单 `run-1793151766355` 的 30/30 与 helper `consumer-1793151837773` 的 52/52；两轮浏览器各登记 1182 个输入，起止与最终提交前源码一致，console／page／HTTP／external 为空，浏览器及私有服务器关闭。类型 1302 文件通过。该片的最终 manifest 与提交证明单独保存在 `schema-form-access-verification/`。

**aa79 阶段保留的显示缺陷：** 外层 properties 与 anyOf 分支重复同一字段时，RJSF 会渲染两份同 ID 控件。该阶段记录保留 `anyOfDuplicateControls: 2`；遍历两份只读输入不代表该 UX 已修复。后续公开 wrapper 修复与最终能力边界如下。

## 最终公开原生接口与能力边界

core、utils 和 validator-ajv8 固定为 6.11.0。后者是公开根入口开发 helper 的常规解析依赖，表单始终传入 CFworker 适配器，未导入或调用 AJV 校验器。没有内部路径、alias、vendor patch、另一套主题或第二个作者校验语义。实际生产消费者的 metafile 证明 AJV／validator 输出为零；打包材料在 `schema-form-union-verification/rjsf6-production-budget-final.json`。6 版使用公开 fieldPathId.path 作为字段位置，以及 ArrayFieldItem／Buttons templates 的原回调，不自行管理数组身份。

AnyOf／OneOf wrapper 只提供基于外层声明字段名与精确 fieldPathId 的显示 mask，ObjectFieldTemplate 不 mount 重复 content。原生 selector、分支状态、schema、完整校验与数据均未改写；同名嵌套对象与数组项不会被误隐藏。原始 public-props trace 在 `props-before-1793152050835`，表明重复来自外层和选中分支同时渲染同一 ID。

两代库都存在无可靠判别值的分支回退：5 版 `dedup-first-1793152255378`、`dedup-final-1793152413401`，以及 6 版 `rjsf6-adapted-1793152980733` 均保留在第 9 项之后的原始失败。不能因为快速补入合法数字就宣称中间输入稳定。最终只开放真实验证的路径：每个分支都必填同一个 discriminator 属性，具有唯一标量 const，当前值可由公开 `getOptionMatchingSimpleDiscriminator` 匹配，且该字段访问可用、公开、可写。其余分支从首开就保留原生只读 selector 和内容，短条件状态说明不可编辑；外层独立公共字段继续编辑。没有分支引擎、猜测值、undefined shape 缓存或 last-good 权威副本。稳定 anyOf／oneOf 在切支后停顿 300ms、输入 `-` 后再停顿 300ms，均可修正和切回。

显式 `additionalProperties:true` 还会把原始数据的未知键加入 RJSF resolved.properties。`opaque-explicit-before6-1793153653460` 真实显示 opaque／privateRoot 名称，虽未显示值；省略 additionalProperties 的原先消费者未覆盖这个分支。最终用公开 ADDITIONAL_PROPERTY_FLAG 同时过滤实际 mount、propertyNames、union mask 和 preserve 的公开字段名单；已知 private SchemaField 不渲染，嵌套无公开字段对象不显示空标题。8KiB opaque 数据、嵌套私有对象与数组私有值继续保存。`opaque-explicit-after6-1793153743124` 的私有名称列表为空。

`run-1793153746620` 与 `run-1793153923566` 的第 15 项原红保留：扩充的 fixture 将分支明确设为 additionalProperties:true 后，原生库合法保留旧 text 与 unknownChoice，旧 oracle 仍要求删除 text。两轮 raw 中 unknownChoice 始终保留，不能把它误报为丢稿。最终该场景检查所有 schema 允许的数据保留；另一份未明确开放 additionalProperties 的专用消费者仍核对原生切支移除旧分支字段。没有为通过旧 oracle 强删作者数据。

最终消费者结果和源码、清理、提交字节索引统一写在 `.presmium/schema-form-union-verification/final-manifest.json`；普通表单增补了私有键名称断言，联合结构另检全部 DOM ID 唯一、nested／array、引用与保留键字段。最终实际计数见该索引，不把此前 30／20 或探索失败冒称最后版本。未运行测试套件、公开服务或部署。

| 最终当前源码证据 | 实际结果 |
|---|---|
| `schema-form-verification/run-1793154064763` | 31/31，显式 broad additionalProperties 的私有名称完全不显示，8KiB opaque 与合法 inactive／unknown 数据保留，普通输入、数组、readonly、IME 均通过 |
| `schema-form-union-verification/rjsf6-delivery-1793153924684` | 28/28，停顿输入、支持／只读能力边界、全部 DOM ID 唯一、同名 nested／array 与四组合 |
| `schema-form-access-verification/after-rjsf6-delivery-1793153925868` | 20/20，组合／独立根只读、坏引用保值、array 动作禁用与四组合；比原 21 少一次重复输入检查正是去重结果 |
| `schema-access-verification/consumer-1793154379418.json` | 新锁下共享 helper 52/52；此处没有重跑套件 |

三份浏览器材料各登记 1182 个输入，起止与提交前当前源码全部匹配，console／page／HTTP／external 为空、私有浏览器和服务器全部关闭。类型 1302 文件、分层、40 包元数据与技能检查通过。运行源码先提交为 `42a0eaad3af214a88270737350b6cb733e2af24c`，纯文档后补。

生产预算是整个公共 workbench 消费者而非表单净体积：压缩前 2,245,395B，gzip 647,835B，metafile 解析 3266 输入，AJV／validator 输出 0B。开发消费者前后为 4,784,774B／4,843,250B（gzip 951,677B／980,067B）；差异包含 fixture 与公开适配变化，不归因于单个库。集成到真实 Doc Dialog 的 source owner／草稿／保存旅程由独立整合片验证，本片不将独立控件消费者冒称整份 Studio 的通过结果。
