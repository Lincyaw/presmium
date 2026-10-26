# JSON 文稿的 IDE 接线验证（2026-10-26）

VS Code 扩展使用原生 JSON 编辑器，只将语言客户端和预览操作关联到 `lecture.json`。工作区包含该入口时激活；独立文件可通过预览命令激活。构建从公开的 `DOCUMENT_JSON_SCHEMA` 生成 `dist/lecture.schema.json`，由 `contributes.jsonValidation` 提供 JSON 补全与结构提示，不维护第二份 schema。

`.presmium/ui-evidence/native-ide-lsp.json` 通过真实 stdio 与 Node IPC 进程完成 11 项检查：

- 打开实际 JSON 文稿，maps 反序排列时仍按代码块归属定位第二页。
- 含 `/` 和 `~` 的稳定块 ID，其 `origin.anchor` 跳转到真实项目代码，并显示代码 hover；`blockId` 引用跳到对应 JSON 实体。
- 未保存的非法引用与不完整 JSON 立即产生诊断。引用错误范围匹配实际字段，文件内容未被语言服务改写。
- 保存 JSON 后真实编译失效锚点，编译诊断通过保留的 JSON pointer 定位正确代码块。
- 压缩为一行的 JSON 仍按讲稿所属步骤定位页面。
- 工程代码文件变化通知触发真实重新编译，修复文件后诊断清除。
- 预览请求实际启动 `presmium dev` 并返回 HTTP 200；非 canonical 文稿入口被拒绝。
- 两种传输均完成初始化、打开、章节请求和关闭。

`native-ide-schema.json` 确认生成 schema 与当前 kernel 导出的对象完全相同。`native-ide-vsix.json` 确认 Linux x64 VSIX 包含该 schema 及关联声明，并从仓库外解包运行时，在另一个临时项目中完成初始化、打开、章节定位和真实网页预览 HTTP 200。VSIX 为 95.06 MB；部署仍使用锁文件，允许补取本地缓存缺少的包。

定向运行了语言服务与扩展的 TypeScript 检查、扩展构建、VSIX 打包，以及 layering、skills、packages 结构检查，均通过。没有运行测试套件，没有新增测试，也没有操作 `4320` 工作区。已移除依赖旧源格式的失效专用测试及其 CI 引用。

当前环境没有 `code`、`code-insiders`、`codium` 或 `code-server` 可执行程序，因此没有验证真实 VS Code 窗口中的菜单、补全显示与侧边预览体验。运行时、协议和打包结果不替代这一窗口验收。

独立审查另以真实慢编译复现了 A 编译期间保存 B，旧 A 的失效锚点诊断被标为 B 版本的问题。现保存与工程变化立即作废旧编译，发布时再核对编译记录的精确源指纹与当前文件；编辑器省略 BOM 时仍能正确匹配文件版本。修复前证据保留在 `native-ide-review-race-before.json`，修复后的同一流程记录在 `native-ide-review-race.json`。
