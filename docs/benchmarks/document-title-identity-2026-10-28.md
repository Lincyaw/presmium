# 页面标题锚点的身份校验

2026-10-28，基于 `43f71230` 的独立临时工作区。原校验允许正文节点使用 `page:intro`，同时页面 `intro` 的标题也使用这个锚点。实际调用原文稿投影后得到两个相同的原生块 ID，标题批注目标又被正文覆盖；真实 HTTP 保存还会把该文稿提交成功。

共享领域校验现为每个现存页面保留其确切标题锚点 `page:<Section ID>`，在实际撞名字段报告 `id.reserved`。规则在结构校验之后运行，覆盖已有统一身份校验入口中的实体、富文本、cue、媒体片段和批注，不改其他命名格式。标题批注引用继续合法；未知插件数据不因此被改写，也不重命名既有合法对象。

| 原始记录 | 实际范围 |
| --- | --- |
| `.presmium/identity-namespace/before-1793132487442/result.json` | 6 项反例材料完成，`productCorrect:false`。领域零错误、原投影出现两个 `page:intro`、标题目标被正文覆盖，实际 CLI 的 HTTP `document/change` 返回 200 并改变 HEAD。SHA-256 `5994287ed409cde7b48eccec7883bbb1f025fc11839fe8626c08b635a70ef56a`。 |
| `.presmium/identity-namespace/after-1793132530116/result.json` | 10/10、`productCorrect:true`。正文与文稿实体碰撞分别在自己的 ID 字段被拒绝；HTTP 全文替换和 `updateText` 返回 422，原文、HEAD、index 不变；官方 MCP SDK 的预检按现有契约返回同一 422 错误，没有改返回协议。正常标题批注经真实预检与提交保存，仍引用 `page:intro` 并指向原标题。SHA-256 `8318e6be90494499f6b9d1e924fbc6539c7c9c92fec482abca456a75e6e0a2f9`。 |

两轮分别记录 1217 份包文件起止 SHA，原始材料不合计为一次通过。最后一轮源码与最终内容相同。97 份 tracked `lecture.json` 均可读取，没有当前标题锚点的 ID 碰撞；`guide-content` 中 `page:cards` 对应的页面并不存在，该合法前缀 ID 保持不变，也有独立非碰撞输入通过校验。

消费者只运行原投影函数及真实 CLI 工作区服务、HTTP、MCP、git。投影使用公共 esbuild API 在 Node 中执行原模块；这不是原生编辑器浏览器旅程或四组合视觉验收。首个 Jiti 直接导入 TSX 的启动解析失败发生在服务启动前，记录保留为 `startup-projection-jiti-failure.json`，没有为观察器修改产品源码。未请求文稿编译或语音生成，没有改公共 Studio 和作者文稿。两轮自有服务与临时 home／workspace 已清，记录的 owner／service PID 均已不存在。

类型检查 1263 文件、分层、技能、包声明和 diff 通过。未新增 tracked tests，未运行测试套件、完整示例构建或导出。
