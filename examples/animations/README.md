# Presmium 示例：用代码讲课

本仓库的中文公开示例，包括两讲完整课程和按主题组织的功能导览。
每份文稿的唯一内容入口是 `lecture.json`；项目代码和媒体文件由文稿显式引用。

| 讲义 | 内容 |
|---|---|
| [冒泡排序](bubble-sort/lecture.json) | 一趟冒泡排序：代码、GSAP 动画、讲解点击的计数组件与光标提示，最后合成为带字幕的讲授 |
| [代码写成的动画](libraries/lecture.json) | GSAP、Anime.js、Motion、Three.js 与 Remotion 各写一节动画，再到讲到哪里点哪里与讲授视频 |
| [功能导览：代码与运行](guide-code/lecture.json) | 项目引用、高亮与变体、JavaScript / Python、参数、逐行轨迹、会话、运行比较与错误反馈 |
| [功能导览：课堂互动](guide-classroom/lecture.json) | 单选、多选、先预测再揭晓、真实代码校验、锚定提问、理解度投票、笔记、学生跟随与受众输出 |

功能与章节的对应关系见 [功能索引](features.json)。
课堂导览中的个人测验和预测不需要模型或课堂服务器；全班统计、提问与跟随需要真实课堂会话，文稿写明了启用条件。
代码导览包含真实执行入口；浏览器 Python 首次使用需加载 Pyodide，命名会话应按文稿顺序运行。
导出 notebook 时，当前内核支持的语言成为代码单元，其它语言保留可读源码。

原有两讲的 `scenes/` 是动画源码，`definitions` 声明场景、状态和时长，`steps` 绑定画面；`components/` 保存讲义自己的组件。
这两讲的既有讲解语音保存在各自的 `.presmium/speech/`，随文稿提交。
没有语音引擎也能播放已匹配的缓存；修改讲稿后，旧音频不会自动成为当前配音，需要配置真实引擎并明确生成。

## 使用

在 Presmium 仓库根目录先运行 `pnpm install`。

| 命令 | 结果 |
|---|---|
| `pnpm studio` | 首次把示例复制到 `.presmium/example-workspace`（独立的 git 仓库，含合成缓存与给 AI 的 `AGENTS.md`），启动可编辑工作台；之后复用该副本 |
| `pnpm demo:check` | 检查两讲 |
| `pnpm demo:build` | 构建网页站点，并把每讲的幻灯片与 notebook 放进站点：`dist/web/`，`<讲义>/slides/`、`<讲义>/notebook/` |
| `pnpm demo:ir` | 输出两讲的 IR |
| `presmium serve examples/animations` | 从示例源码启动工作区预览 |

在示例工作区目录（仓库中的 `examples/animations` 或工作台独立副本）定向检查功能导览：

```sh
presmium check guide-classroom --json
presmium build guide-classroom --to web
presmium dev guide-classroom
```

单讲预览用 `presmium dev bubble-sort --to web` 或 `--to slides`。讲授视频：`presmium build bubble-sort --to web,lecture` 之后运行 `presmium-lecture export bubble-sort --burn zh-CN`。
