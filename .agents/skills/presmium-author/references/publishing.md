# 发布与复现

用于给学生交付、发布课程站点、增加译本，或让别人检出源码后复现结果。先确认交付范围，再构建对应产物。

## 给学生的内容

教师专用块在指令上加 `:audience: teacher`；讲解段落可用 `{only}` 包起来再加受众。整节用顶层 `{audience} teacher`，整份引入文件可在 `{include}` 上加受众。具体写法查 [指令参考](directives.md) 的 `{audience}`。

在文稿目录构建到独立目录，避免混进以前的完整版：

```sh
presmium check --audience student
presmium build --audience student --out dist-student
```

构建会扫描被排除的内容是否经输出或其他文件重新进入学生版。出现 `presmium.audience` 时追溯来源，修正标记或输出；不能只隐藏页面元素。打开学生产物检查教师讲解、答案与媒体。

`presmium serve`、`presmium dev` 提供完整文稿；它们不按读者身份筛成学生版。分享学生产物的静态地址，课堂互动另配独立课堂服务，见 `presmium-present`。

带受众的 `{include}` 如果引入了新章节，之后的内容可能仍属于该章节。在后面用标题明确另开一节，查看相关检查提示。

## 链接与文件随产物发布

普通链接和图片相对于写它的源文件；`/...` 指文稿的 `public/`。被链接的文件随产物发布，代码锚点则相对于 git 根目录。不要因混淆两种规则而改成绝对本机路径。

链接到目录时只发布普通文件，隐藏目录和 `node_modules` 不发布；直接链接到单个文件时仍可能发布隐藏文件，不要链接凭据文件。文稿仓库之外的文件不会发布。

工作区里的跨文档链接写对方的入口，如 `../week2/lecture.md#merge`。构建整个工作区时转成对应页面；只构建一份文稿时不自动发布另一份，查看 `presmium.links` 的提示。

`presmium check` 检查本地链接与片段。需要检查外链时用 `presmium check --external-links`，本机需有 lychee。`checks.forbid` 可限制不应发布的内部词或编号，但不能代替受众标记。

## 增加译本

在原文头部写 `translations: { en: lecture.en.md }`。译本头部写标题、语言与来源：

```yaml
title: Tokenization
lang: en
translationOf:
  entry: lecture.md
  digest: '<presmium check 给出的摘要>'
```

译本复用原文的插件和渲染配置，章节写与原文相同的显式标签，使语言切换停在对应位置。译完运行 `presmium check`，核对内容后填入提示中的 64 位摘要。原文变更后先校对译文，再更新摘要。

网页构建发布译本；幻灯片和 notebook 只有原文。`presmium serve` 的工作区预览目前只显示原文，验证译本需要构建。学生版构建也会筛选并扫描译本。

## 把多份讲义组成课程

在含 `presmium.workspace.yaml` 的工作区根目录运行 `presmium build`，得到 `dist/web/` 的整个站点；在文档目录运行则只构建该文档。工作区应有自己的 git 仓库。

保持文档间链接指向源入口。按部署地址设置 `site.base`，例如项目站点的子路径；导航、页脚与首页按需要设置，不逐项添加用户未要求的配置。发布后验证首页、跨文档链接和语言切换。

## 别人复现需要带走什么

随源码保留 `.presmium/freeze/`（执行录制）、`.presmium/anchors.lock.json`（锚点）、`.presmium/assets/`（本地化资源）、`.presmium/drawings/`（标注）。有合成讲授时另保留 `.presmium/speech/` 与 `.presmium/speech.lock.json`，避免别人构建重新调用语音服务。

录制讲授的 `lectures/<id>/track.json` 记录操作与时间；音视频默认被忽略，仅提交它不能带走声音与录像，需要另行保存媒体或按项目约定使用 LFS。

`dist/` 与 `.presmium/web`、`slides`、`dev` 等工作目录不作为复现源码提交。核对当前项目的忽略规则，不直接提交整个 `.presmium/`。站点启动、PDF 与离线交付见 `presmium-present`。
