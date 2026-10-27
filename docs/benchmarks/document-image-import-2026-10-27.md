# 规范文稿的图片原图导入

2026-10-27，在两个随机端口的独立真实 workspace 服务、私有文稿与 Git 仓库上验证。
主链 **26/26**，补充边界 **6/6**；没有浏览器编辑器或编译结果作为写入权威。

## 接口与能力

`POST document/image` 接收 multipart 的 `change: { id, baseDocumentVersion }` 和原始 `file`。
公共 `DocumentImageImportAnswer` 扩展规范保存应答，增加 assetId 与 width／height；仍使用 source CAS，不等待 IR 编译。
成功的新导入将原字节和规范 image Asset 通过同一次 `SourceEditor.transactionWithBinary` 保存，并共享历史与失败回滚。
文件路径由服务产生为 `assets/images/image_<id>.<实际格式扩展名>`，文件名只用于截断后的 basename 标题。

支持 PNG、JPEG、GIF、WebP、SVG、BMP；格式及 MIME 来自公开 image-size 2.0.4 的 Uint8Array 检查，不信文件名或上传 MIME。
导出 `DOCUMENT_IMAGE_MAX_BYTES` 为 8 MiB，以及 `DOCUMENT_IMAGE_MEDIA_TYPES`。
尺寸必须为正整数，单边不超过 16384、总像素不超过 4000 万。
这是**文件头与尺寸检查，不是完整图片解码**；本记录不据此宣称损坏像素流可正常显示，也不宣称支持 AVIF／HEIC。

## 实际 API 结果

`document-image-api.json` 记录 26/26，运行脚本在忽略目录 `.presmium/document-image-api.mjs`。
PNG、JPEG、WebP 样本由实际 Chromium canvas 编码，GIF、BMP 与 SVG 为完整的微型格式样本；没有调用图片生成服务。

| 场景 | 实际结果 |
| --- | --- |
| PNG 冒充 executable 文件名与 MIME | 仍保存 .png、image/png、实际尺寸和 SHA；路径不受上传名称控制 |
| JPEG、GIF、WebP、SVG、BMP | 均按实际格式识别、返回尺寸并保存原字节 |
| 新导入与 Git | 一次提交同时包含原图和 lecture.json，历史 Undo／Redo 同时移除／恢复二者 |
| 同 intent 丢失回执后重试 | 重读规范源与实际原图，返回同 assetId 和当前版本，files 为空，不生成第二份 bank |
| 新 intent 上传同一图 | 校验真实文件后复用现有 Asset，不变更源或 Git HEAD |
| 并发相同 intent | 两个真实请求返回同 assetId，只创建一份原图 |
| 过期版本、无效头、超过 8 MiB、过大单边或像素量 | 明确拒绝，原 JSON、文件名单与 HEAD 保持 |
| 同 intent 改成另一份有效图 | 409 document-change-id-reused |
| 新图片路径被真实 .gitignore 忽略 | 409；已写入的 JSON 与原图全部回滚 |
| 私有 .git/index.lock 导致真实提交失败 | 500；原 JSON、文件名单与 HEAD 回滚，没有伪造成功 |
| 活动 agent review 锁 | 409，原图与 JSON 均未新增 |
| 较新规范输入已经保存，再重放旧导入 | 409，保留较新的文稿标题，不将旧回执冒充当前版本 |
| 已声明 SHA 的图片文件被真实改写，再上传原图 | 不信原声明；生成另一个实际字节正确的 Asset，没有复用错误文件 |

故意制造的 409／413／422／500 均保留在原始记录，不写成零 HTTP 拒绝。
最后的规范文稿通过实际 kernel validator，正文与 Steps 未改变；图片导入没有创建媒体片段或修改讲稿。

## 去重、并发与字节复核

补充脚本 `.presmium/document-image-boundaries.mjs` 的原始记录为 `document-image-boundaries.json`，6/6：

- 预先存在但没有声明 fingerprint 的本地 SVG，经实际文件比较后复用，files 为空，规范源与 HEAD 不变。
- 不同 intent 使用同一 base 并发，结果为一个 200、一个 409；只有一次原图／Asset 原子新增。
- 成功导入后修改实际原图，再以同一 intent 重试，返回 document-image-asset-changed，源、HEAD 与文件数量保持。
- 带路径与 205 个 emoji 的上传名称只取 basename，标题保留前 200 个 Unicode 码点；实际路径仍按 SVG 字节识别。

复用只考虑同文稿、非隐藏、regular 的本地文件，并通过 SourceEditor 的来源权限检查。
读取使用不跟随最终符号链接的 fd，核对长度、实际完整字节与读取后的文件身份；没有把声明的 fingerprint 当作字节证明。
重放要求仍是原成功应答的源版本，并返回重新读取的当前规范内容；来源已经前进时拒绝。
服务内的 pending intent 与有限 receipt 只覆盖同进程请求，不承诺跨服务重启的回执保留；重启后新 intent 仍可按实际本地图片去重。

## 验证边界与清理

两个消费者都禁止外网请求，记录的 network 数组为空。
自有服务、浏览器编码器、私有文稿与 Git fixture 均在 finally 清理，记录 cleaned 为真；原始 JSON 与脚本权限为 600，不输出访问 token。
没有操作公共 4320／17407、作者文稿或全局客户端构建；没有调用模型、付费服务、新增 tracked tests 或运行测试套件。
这份记录只验后端原图导入与规范事务；原生图片按钮、文件选取、异步编辑归属、显示与外观由单独的前端验证覆盖。
