# Stanford CS336 — Presmium 示例

本仓库唯一的公开示例：Stanford CS336《Language Modeling from Scratch》2026 春季课程，完整转换当前上游的 17 讲，保留英文原文。

来源：[stanford-cs336/lectures](https://github.com/stanford-cs336/lectures)，固定提交 `de53a9f979a6ee35f7d13a5e1aadee5ea1afc58e`。

- 每讲的 `lecture.md` 是连续阅读的文档，按主题组织标题、段落、列表、引用与结果；`slides.md` 是独立编排的 PPT。两者都是原生 MyST，通过现有编译器与渲染端构建，不引入播放器或专用插件。
- 9 份 Python 讲义：文档在原主题下保留语句的最终展示结果；PPT 保留全部展示事件与变量状态变化，用内置步骤逐步出现和替换，可前进和回退。原始 4,527 个执行位置与 PPT 步骤的映射保存在来源清单中，构建不运行训练、GPU 或联网工作负载。
- 8 份 PDF：文档提取可编辑文字与独立图表，合并连续页面的同名标题；PPT 完整保留全部 496 页的公式、图表与原排版。逐页文本提取文件和原 PDF 另行保存。
- `coverage.json` 记录每讲、每页、每个展示事件与资源的来源和校验值；`pnpm --filter presmium-cs336 audit` 验证完整性。
- `source/` 保留上游 Python、依赖清单、图片、缓存资源与执行记录。第 2、14 讲的录制与最新 Python 有小幅差异，两份源码均在 `source/` 保留，记录值不冒充重新执行的结果。

## 使用

在 Presmium 仓库根目录先运行 `pnpm install`。

| 命令 | 结果 |
|---|---|
| `pnpm studio` | 首次复制完整课程到 `.presmium/cs336-workspace`，启动可编辑工作台；之后复用该副本。副本的 `AGENTS.md` 告诉 AI 该改哪些文件（`lecture.md` 与对应的 `slides.md`，不改 `source/` 与来源清单） |
| `pnpm demo:check` | 检查全部 17 讲及内容清单 |
| `pnpm demo:build` | 构建 17 讲的幻灯片、notebook，以及整个课程网页站点 |
| `pnpm demo:ir` | 输出全部 17 讲的 IR |
| `presmium serve examples/cs336` | 从课程源码启动工作区预览 |

课程网页在 `dist/web/`，其中 `lecture_XX/slides/` 与 `lecture_XX/notebook/lecture.ipynb` 是对应讲义的幻灯片和 notebook；单讲产物也保留在各 `lecture_XX/dist/`。课程导航可打开全部幻灯片和下载 notebook。用静态服务器发布 `dist/web/` 即可同时访问所有媒介，部署子路径在 `presmium.workspace.yaml` 的 `site.base` 设置。从课程目录可以用 `presmium dev lecture_01 --to web` 预览一讲，用 `presmium build lecture_01 --to web,notebook` 构建文档与 notebook，用 `presmium dev lecture_01/slides.md --to slides` 预览 PPT，用 `presmium build lecture_01/slides.md --to slides` 构建 PPT。

原 Python 的重新执行需要上游环境，部分课程需要 GPU、多进程、模型下载或远端服务；阅读、构建与编辑本示例不需要这些条件。发布的执行记录是固定观察结果。

## 维护转换

`tools/import.py` 读取上述固定提交的本地检出。用 `pnpm --filter presmium-cs336 import --upstream <检出目录>` 重新转换，依赖版本已固定。转换不会运行上游 Python。生成后执行完整性检查、课程检查与构建。

## 来源与署名

课程内容、代码、图片和 PDF 属于 Stanford CS336 的原作者及其引用的第三方；Presmium 的 Apache-2.0 许可证不覆盖这些材料。上游固定快照未提供单独的许可证文件。本目录记录来源和原始文件，不更改原作者署名。
