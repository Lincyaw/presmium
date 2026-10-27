# MCP 规范文稿局部读取

2026-10-27，在隔离 worktree `mcp-canonical-reads`、初始提交 `608a9e55` 实施。`DocumentAuthoring.outline/readPart` 为 HTTP 和 MCP 提供同一版本绑定的规范读取；没有快照账本、编译、Node 服务装配或写入器。旧 `get_document` 默认全量返回不变。正式协议与限制见 [MCP 作者动作 RFC 第 18 节](../rfc-mcp-authoring-actions.md#18-已实现的版本绑定局部读取)。

验证使用真实 workspace 服务、官方 MCP SDK、现有 `connectPresmiumMcp` 文本适配，以及通过公开 Cordis 插件装配的 `@deepseek-ai/dsh-compaction-tool-result-pruner`。没有模型、ASR、TTS、公共服务或作者文稿请求，没有新增 tracked tests 或运行测试套件。

## 分片读取的真实结果

各轮独立保存，不合并为一次总分。

| 原始记录 | 实际范围 | 结果 |
| --- | --- | --- |
| `.presmium/ui-evidence/canonical-reads-1793110893648/result.json` | 50 页、400 段，包含超长转义标题、正文与 metadata；实际 SDK、DSH wrapper／pruner、完整重建、权限与版本 | 12/12；254 次受预算检查的请求 |
| `.presmium/ui-evidence/canonical-read-errors-1793111078193/result.json` | 1,282,228 字节的坏 Schema，100 条已有校验问题；MCP 和 HTTP 的有界摘要 | 2/2 |
| `.presmium/ui-evidence/canonical-read-stdio-1793111044597.json` | 独立 compiler-only stdio 工具表及真实 capability | 2/2 |
| `.presmium/ui-evidence/canonical-read-oversize-before-1793111743415/result.json` | 旧 source 后实际文件超出 2 MiB；保留原 413 分类作为反例 | 3/3 观察，不计修复验收 |
| `.presmium/ui-evidence/canonical-read-oversize-after-1793111767389/result.json` | 同一超限边界修复后：两个有 source 的读取为 409，首次发现仍为 413 | 3/3 |

大文稿的全量 SDK 响应仍精确等于原 canonical 文稿，pretty JSON 为 406,130 个 UTF-16 字符，实际 pruner 裁掉中段。新读取的 254 次请求及文本响应逐次 JSON.parse，并通过真实 pruner 的 `measureContent/pruneContent`；默认响应均不裁剪，最大 pretty UTF-16 长度恰为 7,168，最大受预算检查的请求 pretty 长度为 345。请求上限按紧凑 JSON.stringify 计算，响应上限包含实际转义与缩进。

默认 outline 首页含 31 页，明确将 30,000 UTF-16 字符标题标为不完整 preview。完整页面值分 16 片，超长正文所在块分 19 片，metadata 分 19 片。消费者通过各集合 outline 发现全部实体，再读取每个实体及根字段，重建结果与原 `DocumentAnswer.content` 深度相等；包含未引用讲稿、素材、定义及批注。重建 JSON 的 SHA-256 为 `c0caf597a381d089c82b3d04e62e0f659b0a3f27a6b9457e917b4db7ab41f4d4`。比较的是规范 JSON 值，不是源文件排版。

同一真实消费者另核对字段／数组选择、own opaque `__proto__` 字段与 prototype 访问的区别、未知实体／字段／非规范数组索引的 404、mid-surrogate／越界 offset 的 400、超预算合法参数的有界 413、HTTP 与 MCP 的相同分片、无 launcher token 的 401，以及绑定另一文稿的 agent token 不能读目标文稿。原 metadata 故意声明不存在的插件，作者读取仍成功；没有请求编译或运行场景。

页间实际修改 canonical 后，outline 和 part 的续页均为 409；改成坏 JSON 后旧 source 仍为 409，首次发现为有界 422。验证结束恢复原始 canonical 字节。省略 source 的 outline 续页被 MCP SDK 输入 Schema 拒绝；这是框架文本错误，不计为共享服务 JSON 回执。缺省 comments 与存在的空集合通过 `present` 区分。

坏 Schema 窄链包含长引号、反斜线、控制字符和 emoji 属性名，已有 validator 最多报告 100 条问题。新读取只返回问题数量与三条有界摘要，实际 pretty JSON 为 1,283 字符，真实 pruner 不裁剪；HTTP 复用相同摘要。独立 stdio 未暴露 `get_document/get_document_outline/read_document_part`，能力中的两个新动作均 false、reason 为 host-unavailable。

## 来源与限制

12 份运行源码在大文、坏 Schema 两轮的起止 SHA 完全相同；stdio 另外记录其三个相关源。验证结束后顺序快进 `main` 的 `2ec47cba`，只合入 examples 指导文稿。第一份 manifest 原样保留为 `.presmium/ui-evidence/mcp-canonical-reads-core12-frozen-manifest.json`。

独审后补一个来源前置条件边界：原 SourceEditor 在源文件超出 2 MiB 时先返回 413，owner 尚未比较 expected source。真实 before 保留该结果；最终 owner 只在读取 canonical 源的阶段，把有 expected source 的 RequestError413 转为 `409 document-version-changed`。没有 source 仍是 413，不伪造 currentSource，不转换 formatter 的 413 或其它 I/O／权限错误。after 使用实际超限文件验证两个有 source 的读取和首次发现，精确恢复原 fixture 字节并全清。原大文 254 次请求没有因此重跑，11 份其它运行源码字节不变；最终 owner 逆补丁后 SHA 与原 `ec14971ff46947a2b60af232899d0f9a30dfc5a91d4d692f33e92f268edb35a2` 一致。逐文件 SHA、raw SHA 和增量谱系见 `.presmium/ui-evidence/mcp-canonical-reads-final-manifest.json`。

早期未完成材料保留：第一次脚本括号语法错误在任何消费者资源启动前退出，仅留本线程工具输出，未生成 raw；两份大文夹具缺少已有必填 `states/stepOverrides`，均在 0 请求时停止并清理。坏 Schema 窄链首次夹具超过既有 2 MiB 源读取上限，真实返回 413；缩小后消费者先误断言 80 条问题，而实际 validator 有 100 条封顶结果。这些是脚本／夹具纠正，不计通过、不改写原 raw，也没有为此修改产品源码。

类型检查通过 1,236 份文件，分层、技能与 diff 检查通过。所有私有 MCP 客户端、workspace 服务、pruner fibers、stdio 子进程及临时文稿目录均已清理。此片只解决完整读取可用性；泛用大文稿 plan/apply 仍可能超过 agent 预算，没有将其或 MCP 全部作者动作标为完成。
