# 工作区内代码锚点的路径基准

2026-10-27，Node 24.22.0。只编译 `examples/animations/guide-code`，另起一份私有工作区服务读取它的 IR；没有构建其他示例、运行测试套件或改动公共 Studio 服务。

## 原因与改动

原示例的三处 `origin.anchor` 写成 `examples/animations/guide-code/code/checkout.ts`。Studio 已把 `examples/animations` 作为逻辑工作区根目录，因而三个引用均为 `lost`，产生用户报告的原始错误。单独编译文稿时，编译器却默认取整个仓库的 git 根目录，三个引用均为 `exact`。新建默认示例副本时的专用路径重写掩盖了这个入口差异。

现在编译器优先采用宿主显式指定的 `workspaceRoot`；否则在文稿目录到所在 git 根目录之间查找最近的 `presmium.workspace.yaml`，没有配置时保持原来的 git 根目录或非 git 文稿目录。示例的三处锚点统一为 `guide-code/code/checkout.ts`，复制工作区直接保留原 JSON。没有迁移、重置或覆盖既有作者副本。

普通文件读取仍限制在逻辑工作区内。锁定提交与永久链接单独转换成实际 git 仓库路径。子模块信息从实际仓库的 `.gitmodules` 读取，只登记位于逻辑工作区中的子模块。

## 实际验证

| 记录 | 结果 |
|---|---|
| `guide-code-anchor-before.json` | 同一权威文稿：Studio 根目录下三个锚点均 `lost`；默认文稿编译取 monorepo 根目录，三个均 `exact`。错误原文与用户报告一致。 |
| `guide-code-anchor-after.json` | 18/18。默认编译与 Studio 显式根目录均正确；region、symbol、pattern 均读取真实代码；嵌套工作区的 HEAD 读取、pin、永久链接正确；显式根目录优先；全新默认副本的 JSON 字节不变且独立 git 根目录正确；没有 YAML 的 git/非 git 回退不变；越界读取拒绝。实际私有 Studio 工作区 `GET ir` 返回 200 和三个 `exact`。 |
| `guide-code-submodule-before.json` | 新路径基准下发现的必要边界：真实本地子模块未被识别，三个 HEAD pin 不能读取；工作区外的模块读取仍拒绝。保留两项失败，未作为通过记录。 |
| `guide-code-submodule-after.json` | 3/3。真实子模块识别为工作区内 `vendor`，pin 读取子模块自己的 HEAD，永久链接指向该仓库的 `code/checkout.ts`；工作区外的另一实际子模块未登记、不可读。 |
| `guide-code-anchor-cli-after.json` | 子模块修复后的最终源码执行单文稿 `presmium check`，0 error、0 warning、0 info。 |

上表原始记录均在本地忽略目录 `.presmium/ui-evidence/`。18 项主记录早于最后的子模块元数据修复，随后用真实子模块和最终单文稿 CLI 检查覆盖该改动；没有把它描述为重新运行的完整链。首次服务探针误按 `answer.ir` 读取实际 `answer.doc`，导致一项消费者断言失败；HTTP 实际为 200、诊断为空。该原记录另存 `guide-code-anchor-route-oracle-before.json`，修正消费者字段后才得到上表的完整 18 项。

对 `examples/animations` 的 canonical 文稿结构扫描，仅这三处引用含有旧 monorepo 前缀；`site` 所有文稿没有 `origin.anchor`，无需迁移。`guide-code/.presmium/freeze` 两个既有文件的时间早于本次首个探针，且已在最初状态中存在，本次未删除或提交。私有服务、临时 git 仓库、子模块和工作区副本均在 `finally` 中清理。

轻量检查：类型检查通过（1169 个文件）、技能检查通过、`git diff --check` 通过。没有运行全量示例构建、测试套件或公开工作区的写操作。
