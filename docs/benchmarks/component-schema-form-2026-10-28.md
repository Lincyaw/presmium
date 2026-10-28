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
