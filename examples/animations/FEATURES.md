# 功能与示例章节

运行 `pnpm studio` 后，在“功能导览”菜单选择文稿，再按下表的章节名定位。文稿链接指向唯一的 `lecture.json`，便于查看或复用实际内容。已有工作台副本不会被自动覆盖；查看仓库中的最新示例可使用 `pnpm studio examples/animations`。

[机器可读索引](features.json) 同时登记插件、公开组件和动画实现的覆盖关系。外部服务、硬件、凭据和浏览器权限需要单独准备；“按条件启用”不表示已经配置。

## 功能导览 01：正文、排版与富内容

[查看文稿](guide-content/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 正文格式、换行、链接与行内公式 | 富文本、链接与公式 (`rich-text`) | 可直接体验 |
| 块级公式与代码正文 | 富文本、链接与公式 (`rich-text`) | 可直接体验 |
| 嵌套、有序与任务列表及引用 | 嵌套列表、任务与引用 (`lists`) | 可直接体验 |
| 跨行跨列表格、列宽、表头与对齐 | 表格、合并单元格与对齐 (`tables`) | 可直接体验 |
| 分栏、堆叠与真实选项卡 | 分栏、堆叠与选项卡 (`layout`) | 可直接体验 |
| Mermaid 流程图与时序图 | Mermaid 流程图与时序图 (`diagrams`) | 可直接体验 |
| 可缩放、可折叠的思维导图 | 可缩放的思维导图 (`mindmap`) | 可直接体验 |
| 本地视频与原生播放控制 | 本地视频、音频与字幕 (`media`) | 可直接体验 |
| 中文与英文媒体字幕轨道 | 本地视频、音频与字幕 (`media`) | 可直接体验 |
| 本地音频与真实解码 | 本地视频、音频与字幕 (`media`) | 可直接体验 |
| 图片、替代文本与说明 | 图片、动图与减少动态效果 (`images`) | 可直接体验 |
| 动图与减少动态效果 | 图片、动图与减少动态效果 (`images`) | 可直接体验 |
| 说明、提示、警告与重要边界 | 提示、折叠、术语与语义标记 (`semantic`) | 可直接体验 |
| 原生可折叠内容 | 提示、折叠、术语与语义标记 (`semantic`) | 可直接体验 |
| 术语与定义列表 | 提示、折叠、术语与语义标记 (`semantic`) | 可直接体验 |
| 键盘标记、上下标与缩写 | 提示、折叠、术语与语义标记 (`semantic`) | 可直接体验 |
| 语义交叉引用与实际章节跳转 | 提示、折叠、术语与语义标记 (`semantic`) | 可直接体验 |
| 响应栅格与卡片链接 | 响应栅格、卡片与同步选项卡 (`cards`) | 可直接体验 |
| 多组选项卡的同步键 | 响应栅格、卡片与同步选项卡 (`cards`) | 可直接体验 |

## 功能导览 02：步骤、动画与参数

[查看文稿](guide-steps/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 稳定步骤与任意顺序定位 | 把一页内容组织成可逆的教学过程 (`start`) | 可直接体验 |
| 逐项揭示和滚动叙事 | 逐项揭示与滚动叙事 (`reveal`) | 可直接体验 |
| 继承状态与显式可见性 | 继承状态，显式改变可见性 (`inherits`) | 可直接体验 |
| 命名状态与完整参数 | 命名状态与参数共同决定画面 (`semantic`) | 可直接体验 |
| D3 数据加入的可逆状态 | D3 数据加入：enter、update、exit (`d3`) | 可直接体验 |
| 真实组件动作与公共控件 | 真实交互组件与公共控件 (`component`) | 可直接体验 |
| 模拟光标移动、悬停与点击 | 模拟光标、聚光与提示 (`guidance`) | 可直接体验 |
| 真实目标聚光提示 | 模拟光标、聚光与提示 (`guidance`) | 可直接体验 |
| 锚定操作提示 | 模拟光标、聚光与提示 (`guidance`) | 可直接体验 |

## 功能导览 03：代码、引用与运行

[查看文稿](guide-code/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 按步骤高亮代码 | 按稳定步骤高亮代码 (`highlight`) | 可直接体验 |
| 代码实现变体 | 切换同一段代码的不同写法 (`variants`) | 可直接体验 |
| 项目 region 引用 | 跟随项目文件的 region、symbol 与 pattern (`references`) | 可直接体验 |
| 项目 symbol 引用 | 跟随项目文件的 region、symbol 与 pattern (`references`) | 可直接体验 |
| 浏览器 JavaScript 与参数运行 | JavaScript：修改参数并比较运行 (`javascript`) | 可直接体验 |
| 真实运行记录与差异比较 | JavaScript：修改参数并比较运行 (`javascript`) | 可直接体验 |
| Python 与布尔参数 | Python：浏览器内执行与布尔参数 (`python`) | 浏览器 Python 首次运行需加载 Pyodide |
| 构建时执行与实际缓存 | Python：浏览器内执行与布尔参数 (`python`) | 浏览器 Python 首次运行需加载 Pyodide |
| 逐行执行轨迹 | 逐行执行，观察变量与输出 (`trace`) | 浏览器 Python 首次运行需加载 Pyodide |
| 命名会话与重置 | 在显式命名的会话中保留状态 (`sessions`) | 浏览器 Python 首次运行需加载 Pyodide |
| 错误与超时反馈 | 错误、超时与缓存是不同状态 (`failure`) | 可直接体验 |
| 实际 AST pattern 引用 | 跟随项目文件的 region、symbol 与 pattern (`references`) | 可直接体验 |
| 按稳定步骤跟踪项目内嵌 region | 跟随项目文件的 region、symbol 与 pattern (`references`) | 可直接体验 |

## 功能导览 04：自测、预测与课堂互动

[查看文稿](guide-classroom/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 单选自测 | 单选、多选与即时自测 (`quiz`) | 可直接体验 |
| 多选与正确答案反馈 | 单选、多选与即时自测 (`quiz`) | 可直接体验 |
| 先预测再揭晓及可逆步骤 | 先预测，再揭晓 (`prediction`) | 可直接体验 |
| 代码练习与真实校验 | 代码练习与真实校验 (`exercise`) | 可用 Python 执行器；浏览器首次运行需加载 Pyodide |
| 锚定提问 | 锚定问题与理解度投票 (`questions`) | 已加入真实课堂 |
| 理解度投票 | 锚定问题与理解度投票 (`questions`) | 已加入真实课堂 |
| 读者笔记与作者原生批注 | 阅读笔记与作者批注 (`notes`) | 作者批注在工作台编辑视图使用 |
| 跟随、独立浏览与课堂归档 | 跟随、独立浏览与重新加入 (`follow`) | 真实课堂会话；发布需配置独立 classroom-server |
| 教师内容与学生版输出 | 教师内容与学生输出 (`teacher`) | 使用 --audience student 构建学生产物 |

## 功能导览 05：讲稿、字幕与讲授制作

[查看文稿](guide-production/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 本步讲稿与单源字幕 | 本步讲稿、发音与动作提示 (`script`) | 工作台本步字幕 / 讲稿字段 |
| 显示文字与实际读音标记 | 本步讲稿、发音与动作提示 (`script`) | 可直接体验 |
| 稳定动作目标与暂停 cue | 本步讲稿、发音与动作提示 (`script`) | 可直接体验 |
| 随动画讲、结束后讲及最短停留 | 随动画讲，或动画结束后再讲 (`timing`) | 可直接体验 |
| 真实音色目录、继承与覆盖范围 | 选择真实音色与继承范围 (`voices`) | 真实已配置的语音 provider |
| 显式合成、任务取消与版本化音频缓存 | 明确生成、取消与过期音频 (`generate`) | 真实语音 provider；修改讲稿后需重新明确生成 |
| 试听、内联动画与正式播放互斥 | 选择真实音色与继承范围 (`voices`) | 工作台试听需真实可用音色 |
| 浏览器录音与录屏的实际权限边界 | 录音、录屏与真实浏览器权限 (`recording`) | 安全上下文、支持的浏览器及用户授权 |
| 转写与词级字幕对齐 | 录音、录屏与真实浏览器权限 (`recording`) | provider 必须真实支持所需精度；估计时间不算词级对齐 |
| 媒体裁切和混音当前门槛 | 媒体裁切与混音的当前门槛 (`media-editing`) | 片段结构已保留；当前讲授运行时尚不能裁切和混音 |
| 讲授、字幕与视频导出条件 | 讲授、字幕与视频导出 (`deliver`) | 匹配版本的音频、媒体能力及导出工具 |

## 功能导览 06：阅读、协作与发布

[查看文稿](guide-publishing/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 全文搜索与真实结果跳转 | 搜索、导航、链接与注释 (`reading`) | 可直接体验 |
| 脚注与稳定语义引用 | 搜索、导航、链接与注释 (`reading`) | 可直接体验 |
| 目录、锚点、外观与窄屏导航 | 一份文稿，按场景选择输出 (`start`) | 可直接体验 |
| 放映、演讲者视图、画笔、黑屏与冻结 | 放映、演讲者视图与讲台工具 (`views`) | 可直接体验 |
| 原生批注、撤消、历史与保存恢复 | 正文批注、撤消与保存恢复 (`collaboration`) | 工作台编辑视图 |
| 媒介内容筛选 | 按媒介和受众选择内容 (`scope`) | 可直接体验 |
| 教师与学生内容的真实输出隔离 | 按媒介和受众选择内容 (`scope`) | 可直接体验 |
| 本地插件注册真实 Custom Element | Web Component 与静态回退 (`extension`) | 可直接体验 |
| 高对比度开关 | 高对比度与离线保存 (`offline`) | 可直接体验 |
| 离线阅读与可选运行资源缓存 | 高对比度与离线保存 (`offline`) | 安全上下文、Service Worker 与可用存储；运行资源示例见 guide-environments |
| 独立 JSON 译文、语言切换与内容 digest | 文稿译文与语言切换 (`translation`) | 可直接体验 |
| 阅读问答与明确的模型能力边界 | 按真实模型能力启用问答 (`assistant`) | 用户自行配置真实模型服务 |
| 课堂 AI 答案先审阅再分享 | 按真实模型能力启用问答 (`assistant`) | 模型服务和真实课堂会话 |
| PDF、图片、PowerPoint 与视觉差异工具 | PDF、图片、PowerPoint、差异与 Notebook (`export`) | 相应导出工具及可启动 Chromium；视频另需编码器 |
| Notebook 静态回退与代码单元 | PDF、图片、PowerPoint、差异与 Notebook (`export`) | 可直接体验 |

## 功能导览 07：可选执行环境

[查看文稿](guide-environments/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| Docker 开发容器执行 | Docker 开发容器与可复现环境包 (`container`) | 开发服务器、Docker 服务、真实镜像 |
| 下载含真实代码与 devcontainer 的环境包 | Docker 开发容器与可复现环境包 (`container`) | 可直接体验 |
| WASI 中运行 C、C++、Ruby 与 SQLite | WebAssembly：C、C++、Ruby 与 SQLite (`wasi`) | 对应的本地浏览器运行资源 |
| WGSL 缓冲区、dispatch 与重复执行 | WGSL 计算着色器与结构化缓冲区 (`webgpu`) | 安全上下文与实际可用 WebGPU 适配器 |
| jax-js 张量与真实设备选择 | jax-js 张量与实际设备选择 (`tensor`) | 支持的设备和实际 jax-js 运行资源 |
| Python 到 WebGPU 的异步桥接 | Python 到 WebGPU 的异步桥接 (`bridge`) | Pyodide 与实际 WebGPU；同步桥另需 JSPI |
| Jupyter 代理与命名内核会话 | 远端 Jupyter 内核与命名会话 (`jupyter`) | 真实 Presmium 服务与运营者配置的 Jupyter 地址/凭据 |
| 远端终端与明确连接生命周期 | 真实终端连接与取消 (`terminal`) | 可用 Jupyter 终端能力，不能在纯静态站点连接代理 |
| env、proxy、prompt、none 认证边界 | 远端 Jupyter 内核与命名会话 (`jupyter`) | hub 当前保留但未实现 |
| 显示实际大小、缓存运行资源后离线打开 | 先检查能力，再执行代码 (`start`) | 安全上下文、Service Worker 与足够本地存储 |

## 功能导览 08：联网媒体与外部图表（可选）

[查看文稿](guide-network/lecture.json)

| 功能 | 章节 | 使用条件 |
|---|---|---|
| 真实外部 YouTube 嵌入 | 嵌入外部 YouTube 视频 (`youtube`) | 可访问 YouTube，第三方播放器与内容可用 |
| 实际 PlantUML 外部渲染 | PlantUML 的外部渲染服务 (`plantuml`) | 可访问配置的 PlantUML 渲染服务 |
| HTTPS 视频、音频与图片 | 从真实仓库地址读取音视频 (`remote-media`) | 外部地址、网络、CORS 与浏览器策略允许 |
| 外部资源本地化与离线边界 | 外部资源本地化与边界 (`remote-assets`) | 仅处理作者显式授权、可合法分发的资源 |

## 动画库与已有完整课程

原有[冒泡排序](bubble-sort/lecture.json)与[代码写成的动画](libraries/lecture.json)保留完整讲授和匹配版本的合成缓存。功能导览补充 D3 与自定义 `defineScene`；完整课程展示 GSAP、Anime.js、Motion、Three.js 与 Remotion。

## 已明确的能力门槛

- 当前编译器明确拒绝 module 实现；使用项目 file 或已注册 plugin。 见 [guide-publishing](guide-publishing/lecture.json) 的 `extension` 一节。
- hub 认证仍保留但未实现；示例不提供成功连接按钮。 见 [guide-environments](guide-environments/lecture.json) 的 `jupyter` 一节。
- production 片段能保存；当前讲授运行时拒绝裁切和混音。 见 [guide-production](guide-production/lecture.json) 的 `media-editing` 一节。

本组覆盖仓库当前 16 个官方插件与 18 个官方插件教学组件入口。IDE、MCP、打包与发布工具在“发布与协作”中提供操作指引。
