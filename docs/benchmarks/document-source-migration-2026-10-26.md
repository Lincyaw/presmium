# 教学输入 JSON 切换记录

`lecture.json` 是仓库教学文稿的唯一运行入口。公开示例、动画图库、模板、功能夹具与文档站均使用共同的 `TeachingDocument` Schema；迁移脚本只从显式指定的离线基线加载旧 MyST 读取器；运行编译器不将旧格式作为输入路径。

## 范围

初始清单共有 130 个名为 `lecture.md` 的文件。原先列为教学输入的 126 项中，118 项迁为规范化 JSON，8 项旧语法专用输入删除。之后确认文档站的 3 份 Markdown 也属于实际构建输入，已重写成当前格式的中英指南。唯一保留的同名普通说明是 `.agents/skills/presmium-present/references/lecture.md`。

另有 4 份夹具英文译文和 3 份文档站英文译文，全部使用 `locales/en/lecture.json`。最终共有 128 个规范入口，原教学 `lecture.md` 与 `lecture.en.md` 入口为 0。译本具有独立文稿 ID、资源目录和 `translationOf` 摘要；原文通过 `metadata.translations` 登记译本。

已删除 46 份内容完成迁移且不再被任何规范文稿引用的旧 include 章节。动画实现、代码、媒体、合成缓存与真实测量结果保留；`database-course/results/report-for-lecture.md` 保留为代码生成的普通实验报告，不是文稿入口。

## 迁移校验

一次性脚本 `scripts/migrate-documents.mjs` 从独立链接依赖的旧提交 `d6ac2f8d` 编译源文件，使用当前共同校验器生成新文稿，再由当前编译器核对。应用前检查入口与实际依赖的内容指纹，独占创建新 JSON；源文件发生变化或目标已存在时拒绝覆盖。

按小组真实核对了页面身份、标题层级、步骤数量、完整正文、代码值、组件身份与时长、讲稿、发音、cue 目标与偏移。脚注引用和定义、显式公式目标另逐项比较标识图与引用诊断。代码引用保留真实区域名、版本引用和仓库地址；独立文稿的相对代码锚点重基到仓库中的同一实际文件。

包含插件不兼容、插件缺失或未配置执行环境的 6 份负例保留同样的实际诊断。它们通过格式迁移和语义对照，不表示相应能力已可用。没有配置远端环境，也没有发起语音合成或付费请求。

原先使用测试准备目录的文稿通过仓库内真实插件、代码与素材准备编译，没有伪造实现。表格保留单元格对齐，include 中的资源按原始文件位置重基。脚注定义保持静音，不能误变成讲稿。

入口切换后又实际编译了 composite publish、旧回归、host、notebook 富内容和代码引用 5 份材料。均无错误，编译依赖不再读取旧 Markdown 教学章节。全部 128 份规范入口通过共同 Schema 与领域校验。

## 文档站

三份指南改为当前 JSON 作者格式、Definition 插件契约和接口版本边界，删去旧 MyST 创作说明。构建脚本检查原文及已登记译本，使用同一个规范入口常量。跨文稿链接和显式英文译本链接都映射到发布页面，保留语言和片段。

实际运行结果：

- 6 份中英指南的 `presmium check` 均无错误、警告。
- 文档工作区网页构建成功，TypeDoc 生成成功。
- 751 个生成 HTML 页面的本地 `href`、`src` 检查没有失效链接。
- 浏览器查看 1440 和 390 宽度、浅色与深色四种组合，正文可读，整页没有横向溢出；代码在自身容器滚动。
- 英文正文跨文稿导航进入英文译本，显式译本链接保留目标语言与锚点。浏览器没有页面异常或 HTTP 失败。

证据在 `.presmium/ui-evidence/`：`source-migration-inventory.json`、`migration-final-contract.json`、各 `migration-group-*.json`、`locale-final-compilation.json`、`fixture-discovery-json.json`、`site-json-build.log` 和 `site-json-browser.json`。四张可直接查看的截图为 `site-json-{desktop,narrow}-{light,dark}-view.png`。

## 验证边界

按照根 AGENTS，没有写新测试，没有运行单元或全量套件，也没有运行示例两讲的完整构建。旧 MyST 解析、源码行写回和 Slidev 专用且已失效的用例直接删除；现有功能材料通过真实编译、服务或浏览器验证保留。

规范化数据保留未知版本扩展的完整结构与回退。能保留数据不代表编辑器、执行器或输出端支持该能力；这些能力仍分别依实际契约、诊断与运行结果判断。
