# 参数枚举清空与保存状态：2026-10-28

可选枚举选择“请选择／Choose”后，表单和规范 JSON 都应删除该字段；不能选回第一项。必填枚举仍显示缺失错误并禁用应用，数字 0、布尔值 false 与枚举中的空字符串不应因假值判断而丢失。

公共 Select widget 原先用 `Number(value)` 取索引，空占位值被转为 0。现在使用 RJSF 公开 `enumOptionsValueForIndex(value, choices, options.emptyValue)`；只读／禁用门禁、完整 CFworker 校验与原 source owner 都未改。枚举空字符串选项仍编码为自己的数字索引，和空占位值分开。

真实 Studio 验证还确认了另一个完成反馈缺口：外部组件事务从 clean 开始，收到已提交的 200 后，source actor 已结束 saving，但 Workbench 只在 previous.dirty→clean 时更新已保存状态，因而一直显示 Saving。映射现同时识别 previous.saving→clean；error、仍在 saving 和仍 dirty 的优先判断保留，没有增加 writer 或改变确认协议。

## 实际证据

独立工作区 `schema-enum-clear`，基线 `0f57b1bc`。临时消费者与原始材料均在该工作区忽略目录 `.presmium/`，没有新增 tracked tests 或运行套件。

| 原始材料 | 实际结果 |
|---|---|
| `schema-enum-clear/before-1793155175057` | 两项 expected-counterexample：Choose 后值变成第一项，DOM 索引为 0；浏览器／私服全清 |
| `schema-enum-clear/after-1793155225203` | 前 7 项通过后，观察器误把无 type 的混合 oneOf 常量结构当作已支持 Select，实际显示 Unsupported，定位超时；保留原红，不为该范围增加控件 |
| `schema-enum-clear/after-final-1793155379959` | 18/18：可选选择→清空→JSON Apply／Reopen、必填缺失与重新选择、数字 0、布尔 enum 的原生 No→false、空字符串与占位的区分、只读、8KiB unknown 数据保留和明暗 × 1440／390 |
| `enum-studio/run-1793155489121` | enum 修复提交下真实 plan／apply 200，规范 JSON 的 mode 已删除，但界面 Saving 持续 30 秒，ACK 观察超时；没有把文件改动冒充完成。原始结果及截图保留，私有 Studio 全清 |
| `enum-studio/run-1793155969727` | 保存状态修复后真实 Studio 10/10：选择→请选择→应用→浏览器刷新→重开，规范 JSON 无 mode；只读与 unknown、另一个实例完整保留。真实已提交 200 暂缓回执时仍 Saving，回执确认后 Saved；原生正文首次回执不清除后来输入，第二次回执后才 Saved |

最终 Studio 登记 1190 个运行输入，起止与当前源码全部一致；前后提交分别为 `fd9a1f1772c03d82ebb10ffc5ffe3ee60d2c7a6e` 和 `7935255b3c3bc8cecf6b0f16a890a5f01d239688`。受控 18 项材料属于前一个提交阶段，后来 Workbench 单行状态映射不在该阶段的 current 声明中；Select widget 字节与最终版本相同。完整索引及精确提交证明在 `.presmium/schema-enum-clear/final-manifest.json`。

Studio 的 page／console／HTTP／external／模型请求均为空，所有浏览器、服务、临时 home、workspace 与 fixture 全清。类型 1314 文件通过。根代理对 Select 三行改动独立静审通过，并核对保存状态映射；本片没有操作公共服务、部署或 push。刻意的 HTTP 失败未在本片注入，不将未变化的错误优先分支冒称已做故障验证。

## 4320 更新

运行版本 `a4030c7ac91194f6c7f5d6986dd8d6d2d0c6356a` 已更新至工作台。独立快照构建通过 1236 项来源检查，客户端 SHA-256 为 `1f977d4f1361f3e50d2c3866a162cac50c3f487cb74953a07f5e726289d06317`。更新后只读健康检查 22 项通过，`localhost` 与 `127.0.0.1` 的既有认证会话正常，重启过程保留 11 份文稿。
