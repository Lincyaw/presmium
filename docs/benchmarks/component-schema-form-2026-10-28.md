# 公共参数表单：2026-10-28

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
