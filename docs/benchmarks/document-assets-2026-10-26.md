# 文档编辑页相对图片验证（2026-10-26）

使用功能导览中的真实 `media/spinner.png` 创建独立 Studio 文稿。修前原生图片直接请求 Studio 的 `/media/spinner.png`，响应 404，`naturalWidth` 为 0；canonical `Asset.location` 仍为相对路径。证据保存在 `.presmium/ui-evidence/native-image-asset-before.json`。

修复通过 BlockNote 的公开 `resolveFileUrl` 解析显示地址。原生 block 的 URL 与唯一 JSON 源仍保存 `media/spinner.png`；解析器只把已经登记的本地 asset 指向同源授权代理。外部 URL 和 data URL 保留原公开解析路径，不给文件 URL 添加认证查询。

独立审查另确认，只检查工作区边界会绕过源文件权限：登记指向隐藏 Git 文件或兄弟文稿的 asset 仍能读取。修前 dummy 文件证据保存在 `native-asset-boundary-review.json`。二进制读取现复用 `SourceEditor.readableFile`，沿用源码编辑的隐藏路径、文稿归属、realpath 与普通文件检查，没有另开隐式共享目录权限。

独立临时 Studio、工作区服务、真实 DSH 授权代理及 Chromium 完成 `document-asset-consumer.json` 的 25 项检查：

- 实际 PNG 正常加载为 96×96，代理响应的字节数与磁盘文件一致，MIME 为 `image/png`。
- 未登记、不存在、目录、越出工作区、符号链接及外部地址均返回明确拒绝；`.git`、`.presmium`、`node_modules`、`dist` 和兄弟文稿路径同样被源权限策略拒绝；无授权的服务请求返回 401。
- 二进制响应带 `nosniff`、同源资源策略与 sandbox CSP，代理保留这些响应头。HTML 按附件返回；直接嵌入含脚本的 SVG 时，浏览器实际阻止脚本执行。
- 正文输入保存后相对路径不变。另挂载真实原生编辑器，读取公开 block URL、修改图片说明和宽度、执行原生 Undo，并分别通过真实 CAS 保存；原路径始终保留，没有代理地址写入 canonical JSON。
- 1440 与 390 宽、明暗色四组实际界面均显示图片；窄屏关闭导航抽屉后检查图片边界，没有横向溢出。

隔离客户端首次启动记录过 Harness 的 `renderSlot('root') before registration`，重新加载后以上流程没有运行时异常；该启动记录保留在证据的 `bootstrapErrors`，没有作为图片修复已消除的问题。故意触发的拒绝和 SVG 脚本拦截与成功流程分开记录。

类型检查通过。没有新增测试、运行测试套件、完整示例构建，或重启共享的 17359/4320 服务。
