# 从空白文稿开始

默认模板现在是一页、一个空段落和一个稳定步骤，页面标题沿用作者输入。预填的三页说明正文已移除；默认步骤仍使用实际的 4 秒停留与 0.5 秒结束停顿。

Studio 的模板写入与 CLI 创建只在结构化 `Section.title` 精确等于 `{{title}}` 时采用输入标题。通过 JSON 序列化保存引号与反斜杠，不在整个工程中替换文本。自定义模板的页面结构、正文和代码保持原样，文稿复制继续只生成新文稿身份。不会刷新或覆盖已有作者文稿。

2026-10-27 的定向实际记录位于本地忽略目录 `.presmium/ui-evidence/`：

| 记录 | 实际结果 |
| --- | --- |
| `blank-document-creation-before.json` | 真实 UI 复现：新建得到三页预填正文、首个页面没有沿用标题；创建后无正文焦点，未再次点击的键入没有保存。四项失败保留。 |
| `blank-document-cli.json` | 10/10。通过实际公开 CLI wrapper 分别创建 lecture 与 workspace，标题含引号和反斜杠；规范 JSON 有效、只有一个空页、步骤时机正确。两份新文稿分别执行实际 `presmium check` 成功，未构建其它文稿。 |
| `blank-template-instantiation.json` | 9/9。真实私有服务采用三页自定义模板，只替换指定标题，正文与代码中的字面 `{{title}}` 不变；复制保留内容，已有目标返回 409 且文件未覆盖，原作者文稿与模板字节不变。 |
| `blank-document-creation-after.json` | 最终 29/29，浅／深色 × 1440 桌面／390 粗指针。空白模板、标题、原生正文聚焦及无需再次点击的实际键入均正确，并确认四轮保存回执为 saved。更早仅检查磁盘的弱观察保留为 `blank-document-creation-after-disk-first.json`。打开焦点交接和窄屏新增页的加强验证见[直接输入记录](document-creation-focus-2026-10-27.md)，最终 37/37。 |

首次 UI 消费者误读创建应答中的 `op`，实际应答只有 `revision/dir`，在断言前停止；`blank-document-creation-response-oracle-before.json` 保留。CLI 消费者初次使用内部 CLI 包入口，该入口未安装创建器；改用实际公开 `presmium` wrapper 后才得到上表结果，原记录为 `blank-document-cli-internal-entry-before.json`。私有 API 消费者初次将 Node Response 的 `status` 属性当作方法，保留为 `blank-template-instantiation-status-oracle-before.json`；修正观察器后才完成 9 项，没有为此修改产品。

CLI、API、浏览器与临时项目均已清理，没有模型或生成调用，没有操作公共 4320 或作者文稿。模板打包脚本已运行，生成模板与源字节一致；技能与包发布结构检查通过。未运行测试套件、完整 E2E、全量示例构建或外部消费者安装验收。
