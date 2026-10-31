# 界面术语与文案规范

本文是 Presmium 界面文本的唯一来源，规定 zh-CN 与 en 中的名称、命令、状态词与写法。范围是所有面向作者、讲者与读者的文本：工作台、查看器与站点外壳、插件的读者界面、MCP 审批与工具错误、命令行输出、VS Code 扩展。其他文档的用词与本文冲突时以本文为准。语言如何选择见 [架构](architecture.md)。

zh-CN 以 Microsoft Office 的简体中文本地化为首选，没有对应时参照 Keynote、Adobe Premiere Pro 与 Google 文档；en 以 Microsoft Office 的美国英语为首选。界面不出现口语、内部名称、开发者用语和另一语言的词。

## 1. 语言与地区

- zh-CN 为简体中文（中国大陆），en 为美国英语（`color`、`canceled`、`center`、`gray`）。
- 两种语言的文本同时修改，含义一致，键集相同。en 中不出现汉字，zh-CN 中不出现整句英文。
- 同一对象、命令或状态在全部界面用本文同一行的词。新增术语先加进本文，再写入目录。
- 品牌、格式与标准名称两种语言相同：Presmium、Presmium Studio、PDF、PowerPoint、Notebook、LaTeX、PNG、AI。AI 助手的预设名称是 Presmium。
- 服务商品牌按它自己的本地化写法，如火山引擎 / Volcengine。品牌名可以含有单独不用的词（“火山引擎”中的“引擎”）。
- 写进产物的文字（新页面标题、副本名称、Notebook 中的说明）按文稿的 `lang`，不按界面语言。
- 工作台按“设置 → 语言”的选择，未选择时看 `navigator.language`；命令行按系统语言（`LC_ALL`、`LC_MESSAGES`、`LANG`）。

## 2. zh-CN 写法

- 标点用全角。数字、单位、快捷键与代码保留半角（`Ctrl+Z`、`8 MiB`）。
- 引号用“”，嵌套用‘’；不用「」『』和直引号。
- 汉字后接拉丁字母或阿拉伯数字时加一个半角空格（“第 3 页”“AI 助手”“导出 PDF”）。全角标点两侧不加空格。
- 省略号用单个“…”：进行中的状态（“正在保存…”），以及打开对话框或还需输入的命令（“重命名…”）。
- 不用感叹号、语气词、表情与敬称“您”。命令与状态不称呼作者。
- 按钮与菜单项用动词或动宾短语，不加句号；标签、窗格与对话框标题用名词短语。完整的句子以句号结尾。
- 失败状态写“X失败”；失败消息以“无法X”开头，说明原因、输入是否保留与下一步（“无法保存文稿。草稿已保留，请重试。”）。不用“没能”“没法”“出错了”。
- 请求作者操作用“请…”，一条消息至多一个“请”。
- 命令行消息以程序名加半角冒号和空格开头：“presmium: 找不到 …”。

## 3. en 写法

- Title Case：命令（按钮、菜单项、工具栏按钮及其提示中的命令名，`New Comment`、`Export Video…`）；有名字的区域（窗格、视图、标签页、对话框与页面标题，`Version History`、`Presenter View`）；设置的分节名；待确认操作的标题。
- sentence case：系统消息、错误、确认对话框的正文；字段标签、选项、复选框与分段控件的选项（`Page title`）；状态词（`Saving…`、`Export failed`）、占位文字与提示。
- Title Case 依照 Microsoft Style Guide：冠词、并列连词与不超过四个字母的介词小写，位于首尾时除外。句中提到命令或区域时保留其大小写（`Open Version History.`）。
- 串列用 Oxford comma。省略号用单个 “…”，规则同 zh-CN。
- 引号用 “ ” 与 ‘ ’，撇号用 ’。不用感叹号与 `Oops` 一类语气词。
- 缩约（`Couldn’t`）在同一目录中一致；失败状态写 `X failed`，消息写 `Couldn’t X. …`。
- 称呼作者用 you；AI 在句中写 the AI。

## 4. 产品对象

“不用”一列中加反引号的词由 `scripts/check-i18n.mjs` 报告：含汉字的词查 zh-CN 文本，其余的词（整词、不分大小写）查两种语言的文本。只在特定上下文中不用的词不加反引号。

| zh-CN | English | 含义与用法 | 不用 |
|---|---|---|---|
| 文稿 | Document | 作者编辑的一份讲义（`lecture.json`）；列表、标题栏与消息中都叫文稿 | `文档稿`、`讲义文件`、`Lecture file` |
| 工作区 | Workspace | 存放若干文稿的文件夹，首页列出其中的文稿 | `项目目录`、`Project folder` |
| 页面 | Page | 文稿中的一页（`Section`）；在幻灯片视图与放映中显示为一张幻灯片 | `章节页`、节（指页面时） |
| 幻灯片 | Slide | 页面在幻灯片视图、放映与导出中的呈现；只在这些形态中使用 | `胶片`、`投影片` |
| 内容块 | Block | 页面中的一段正文、代码、图表、动画或插件内容 | `区块`、`组件块` |
| 来源材料 | Source Material | 作者上传或引用的文档、图片、音视频与链接 | `原始资料`、附件（指来源材料时） |
| 素材 | Asset | 可在文稿中引用的图片、图表、动画与媒体；AI 生成的叫“生成素材 / Generated Asset” | `资源文件`、`Resource` |
| 步骤 | Step | 页面中一个可定位的显示状态；界面编号从 1 开始 | 帧（指步骤时）、Frame（指步骤时） |
| 讲稿 | Script | 每个步骤要讲的文字，用于配音与字幕 | `逐字稿`、`讲解词`、`Narration`、Transcript（指讲稿时） |
| 配音 | Voiceover | 由讲稿合成或作者录制、按步骤播放的音频 | `讲解`、`讲授轨`、`旁白`、`Narration`、`Lecture track` |
| 录音 | Recording | 作者录制的音频或视频 | `录制轨`；Take（指录音时） |
| 音色 | Voice | 合成配音所用的声音 | `TTS 音色`、`发音人` |
| 语音服务 | Voice Service | 合成配音与识别录音的服务 | `TTS`、`引擎`、`Engine` |
| 字幕 | Captions | 播放时显示的文字，由讲稿或转写文本派生 | `Subtitles` |
| 转写文本 | Transcript | 识别录音得到的文字；与讲稿分开保存 | `识别稿`、`听写稿` |
| 编排 | Sequence | 视频制作中按时间排列画面、配音与字幕的视图与其中的决定 | `编排轨`，单独的 Production |
| 时间线 | Timeline | 编排中的时间轴 | `时间轴线`、`Track list` |
| 讲授 | Lecture | 读者看到的、带配音与字幕按时间播放的形态 | `讲授轨`、`Lecture track` |
| 批注 | Comment | 作者留在正文选区或内容块上的意见，可回复、解决 | `评论`、备注（指批注时） |
| 版本 | Version | 一次已保存的修改；版本历史中的一项 | `修订号`、`Revision`、`Commit`；提交（指版本时） |
| 版本历史 | Version History | 列出各版本、可撤消或还原其中一项的窗格 | 历史记录（指版本历史时）、`文档历史`、`修改记录` |
| 草稿 | Draft | 尚未确认保存的输入，在本机保留 | `临时稿`、`暂存` |
| 预览 | Preview | 在编辑时查看读者看到的效果 | `渲染结果`、`Render` |
| 放映 | Presentation（区域）、Present（命令） | 全屏逐步展示幻灯片；进入的命令叫“放映 / Present”，退出叫“结束放映 / End Show” | `演示模式`、`Slideshow`、`Slide show` |
| 演示者视图 | Presenter View | 讲者在放映时看到的、带讲稿与计时的视图 | `演讲者视图`、`演讲者窗口`、`Speaker view` |
| 观众视图 | Audience View | 放映时观众看到的画面 | `听众视图`、`听众画面` |
| 视频制作 | Video Production | 处理步骤、讲稿、配音、字幕与时间线的独立入口 | `视频剪辑`、`Video editing` |
| 导出 | Export | 由已保存的版本生成网站、幻灯片、Notebook、PDF、图片、PowerPoint 或视频文件 | `生成记录`、Make（指导出时）、`Build`（作者界面中） |
| 导出记录 | Export History | 导出窗格中已完成与进行中的导出列表 | `生成记录`、`Made files` |
| 网站 | Website | 文稿导出为网页的形态 | `站点产物` |
| 网站主题 | Site Theme | 网站的预置结构与视觉，如课程、文档、展示；配置项为 `theme` | |
| 课程 | Course | 网站主题 `course` 的名称，突出课程入口与有序学习 | |
| 文档 | Docs | 网站主题 `docs` 的名称，突出阅读与目录；区别于作者编辑的“文稿” | |
| 展示 | Showcase | 网站主题 `showcase` 的名称，突出作品与媒体展示 | |
| 网站页面 | Site Page | 独立设计的站点介绍与展示内容；不使用教学文稿的页面、步骤和讲稿模型 | |
| 首页模板 | Landing Page Template | 作者提供的 HTML、CSS 与 JavaScript 首页入口；与预置网站主题分开配置 | |
| 首页 | Home | 网站根地址的页面，可使用独立的网站页面，也可显示文稿列表或指定文稿的全文 | |
| 页面布局 | Page Layout | 文稿网页的排版选择：文章 / Article、首页 / Landing、宽版 / Wide；配置项为 `layout` | |
| 形态 | Form | 导出与审批中说出渲染端时用它们的名称：web 为“网站 / Website”，slides 为“幻灯片 / Slides”，notebook 为“Notebook / Notebook”，lecture 为“讲授 / Lecture”；`--to` 的参数仍是这些标识 | 渲染端（作者界面中）、Renderer（作者界面中） |
| 语句 | Sentence | 讲授编辑器与配音中的一句讲稿，配音按语句生成 | 句段、Segment（指语句时） |
| 授权 | Consent | 复刻音色时作者确认有权使用这段声音的声明 | `同意书`、`Agreement` |
| 待确认 | Pending Approvals | AI 或外部工具请求执行、需要作者允许的操作；数目写在后面：“待确认 2 / Pending Approvals (2)” | `Approvals 2`、`审批流` |
| AI 助手 | AI Assistant | 工作台中可选的 AI，窗格与设置中叫“AI 助手 / AI Assistant”；命令与消息中简称“AI / the AI” | `智能体`、`agent`、`Copilot`、`机器人` |
| 对话 | Chat | 与 AI 助手的一次对话；“新建对话 / New Chat”“对话记录 / Chat History” | `Conversation`；会话、Session 只指浏览器的本次会话（“仅本次会话 / This session only”） |
| 模型 | Model | AI 助手所用的语言模型 | `大模型`、`LLM` |
| 密钥 | API Key | 模型服务的访问凭据；字段标签写作“密钥 / API key” | `凭据串` |
| 访问令牌 | access token | 进入工作区服务、MCP 服务与 Jupyter 服务的凭据（“访问令牌在 … 中”“Jupyter 访问令牌”）；字段标签写作“访问令牌 / Access token” | `令牌`、`token`、`访问凭据` |
| 读者问答 | Reader Q&A | 读者在网页中向 AI 提问的插件界面 | `助教机器人` |
| 课堂 | Classroom | 讲者与在场读者同步的课堂会话与作答 | `房间`、`Room` |
| 诊断 | Diagnostics | 文稿中无法正确显示的内容及其说明；作者界面只给出可读的说明与“详细信息”。命令行与诊断输出指出日志所在的文件时写“日志文件 / log file”（“presmium studio: 日志在 …”），其他地方仍不用 | `错误码`、`日志`（作者界面中）、`stack`、`Log`（作者界面中） |

## 5. 视图、区域与设置

| zh-CN | English | 含义与用法 | 不用 |
|---|---|---|---|
| 编辑 | Editing | 工作台的编辑模式；对应的命令为“编辑 / Edit” | `编辑态` |
| 查看 | Viewing | 只读、与读者一致的模式 | `浏览态`、`阅读态` |
| 网页 | Web | 视图菜单中的网页版式 | 文档（指视图时）、`Document view` |
| 幻灯片 | Slides | 视图菜单中的幻灯片版式 | `PPT` |
| 导航窗格 | Navigation Pane | 列出页面与标题的窗格 | `目录栏`、`侧栏` |
| 课程目录 | Course Contents | 课程主题中按顺序列出内容的区域 | |
| 批注窗格 | Comments | 列出全部批注的窗格 | `评论区` |
| 状态栏 | Status Bar | 窗口底部的页码、字数与保存状态 | `底栏` |
| 应用栏 | App Bar | 工作台顶部的入口栏 | `活动栏`、`Activity bar` |
| 设置 | Settings | 设置窗口；分节为“常规 / General”“模型 / Models”“外观 / Appearance”“语言 / Language”“快捷键 / Keyboard Shortcuts”“语音服务 / Voice Service”“关于 / About” | `偏好`、`Preferences`；配置（指设置时） |
| 帮助 | Help | 帮助与入门说明 | `说明书`、`FAQ` |
| 滚动叙事 | Scrollytelling | 随滚动逐步显示的网页版式 | `滚动讲述` |
| 启动报告 | Startup Report | 演示者视图中列出各插件是否已启动的区域；插件以名称显示，不显示标识 | `插件状态表` |
| 课堂与工具 | Classroom and Tools | 演示者视图中课堂、笔记与启动报告所在的区域 | |
| 笔记 | Notes | 读者或讲者自己记下的文字，只自己可见；与作者留在文稿上的“批注 / Comment”不同 | 备注（指笔记时） |
| 第 N 页 | Page N | 课堂位置、搜索结果与提示中指出页面：“第 3 页 / Page 3” | 第 N 节（指页面时）、Section N（指页面时） |
| 当前代码 | Current Code | 代码来源条中指向工作副本里当前代码的标签 | 工作区（指代码来源时） |
| 欢迎使用 Presmium | Welcome to Presmium | 首次打开时的欢迎对话框 | `欢迎来到` |

## 6. 命令

命令按第 2、3 节的写法：zh-CN 用动词短语，en 用 Title Case；打开对话框、还需要输入的命令带“…”。

| zh-CN | English | 含义与用法 | 不用 |
|---|---|---|---|
| 新建 | New | 新建文稿、页面、批注、对话：“新建文稿 / New Document” | `添加文稿`、`Create new` |
| 打开 | Open | 打开文稿、链接、导出文件 | `进入` |
| 关闭 | Close | 关闭窗格、对话框或提示 | 收起（指关闭时）、`Dismiss` |
| 保存 | Save | 保存当前输入 | 存储（指保存时）、Store |
| 撤消 | Undo | Ctrl+Z（Apple 设备上 ⌘Z）；与 Microsoft Office 相同写作“撤消” | `撤销`；回退（指撤消时） |
| 恢复 | Redo | Ctrl+Y（Apple 设备上 ⌘⇧Z；Ctrl+Shift+Z 同样可用，但界面只写一种）；只指重做被撤消的操作 | 重做（指恢复时）、Restore（指恢复时） |
| 还原 | Restore | 把内容还原到版本历史中的某个版本 | `回滚`、`Revert`、`Roll back` |
| 恢复草稿 | Recover Draft | 取回本机保留的草稿；不单写“恢复” | `取回草稿`、`Restore draft` |
| 放弃 | Discard | 放弃草稿或未保存的修改 | `丢弃`、`抛弃`、`Throw away` |
| 删除 | Delete | 删除文稿、页面、批注、内容块，以及时间线上的音频片段（只移出时间线，不删除音频文件，也写“删除”） | 移除（指删除对象时）、Remove（指删除对象时） |
| 移除 | Remove | 把引用、筛选或列表项移出，不删除对象本身 | |
| 剪切 | Cut | Ctrl+X | |
| 复制 | Copy | Ctrl+C；复制页面写作“复制页面 / Duplicate Page” | `拷贝` |
| 创建副本 | Make a Copy | 复制整份文稿 | `克隆`、`Clone`、`Duplicate document` |
| 粘贴 | Paste | Ctrl+V | |
| 插入 | Insert | 插入内容块、图片、公式：“插入图片 / Insert Picture” | `添加块` |
| 图片 | Picture | 命令与窗格中的图片（“插入图片 / Insert Picture”“替换图片 / Replace Picture”），消息中也写 picture | Image（命令与窗格中） |
| 重命名 | Rename… | 重命名文稿或页面 | `改名`、`修改名称` |
| 上移 / 下移 | Move Up / Move Down | 调整页面顺序 | `往上挪`、`往下挪` |
| 搜索 | Search | 在列表中搜索 | `检索`、`查询` |
| 开始阅读 | Start Reading | 网站首页进入第一份文稿的命令 | |
| 浏览文稿 | Browse Documents | 网站首页定位到文稿列表的命令 | |
| 查找 | Find | 在文稿正文中查找 | |
| 共享 | Share | 与他人共享 | `分享` |
| 导出 | Export… | 打开导出窗格或对话框；具体项写作“导出视频 / Export Video”“导出 PDF / Export PDF” | `生成网站`、Make（指导出时） |
| 下载 | Download | 下载导出的文件 | |
| 打印 | Print… | 打印 | |
| 放映 | Present | 从当前页开始放映 | `开始演示`、`Play slides` |
| 结束放映 | End Show | 退出放映 | `退出放映`、`Exit presentation` |
| 播放 | Play | 播放讲授、配音或视频 | |
| 生成配音 | Generate Voiceover | 由讲稿合成配音；“生成”只用于合成配音与 AI 生成素材 | `合成讲授轨`、`Synthesize` |
| 新建批注 | New Comment | 在选区或内容块上添加批注 | `添加评论`、`Add comment` |
| 发布 | Post | 发布批注或回复 | `提交批注` |
| 解决 | Resolve | 将批注标为已解决 | `关闭批注` |
| 重新打开 | Reopen | 重新打开已解决的批注 | |
| 发送给 AI | Send to AI | 把批注或所选内容交给 AI 助手 | `交给 AI`、`Hand to AI` |
| 用 AI 改写 | Rewrite with AI | 让 AI 改写所选文字；“要用 AI 改写吗？”中的“用 AI 改写”就是这个命令 | `AI 改写`（不带“用”时） |
| 用 AI 修复 | Fix with AI | 让 AI 修复无法正确显示的内容 | `让 AI 修复` |
| 接受 / 拒绝 | Accept / Reject | 审阅 AI 的修改，与 Word 修订相同 | 保留、Keep（指接受时） |
| 允许 / 拒绝 | Allow / Deny | 答复待确认的操作 | `同意`、`批准`、`Approve` |
| 确定 | OK | 确认并关闭对话框 | `好的`、`Okay` |
| 取消 | Cancel | 不做更改并关闭，或停止进行中的导出 | `算了` |
| 应用 | Apply | 应用设置或参数 | `套用` |
| 重试 | Retry | 重新执行失败的操作 | `再试一次`、Try again（按钮中） |
| 重新加载 | Reload | 重新加载页面或预览 | `重新载入`、`刷新页面` |
| 刷新 | Refresh | 重新获取列表或预览内容，不重新加载页面 | |
| 显示 / 隐藏 | Show / Hide | 显示或隐藏窗格 | `收起`、展开（指窗格时） |
| 更多 | More | 打开更多命令的菜单 | 其他（指更多命令时） |
| 详细信息 | Details | 打开错误或项目的详细信息 | `技术详情`、`Technical details` |
| 开始使用 | Get Started | 欢迎对话框的主按钮 | `开始吧` |
| 全屏 / 退出全屏 | Full Screen / Exit Full Screen | 进入或退出全屏 | `最大化`（指全屏时） |
| 上一步 / 下一步 | Previous Step / Next Step | 放映与演示者视图中移到上一个或下一个步骤 | |
| 重新运行 | Run Again | 再次运行代码块 | `再跑一次` |
| 重新生成配音 | Regenerate Voiceover | 讲稿改过之后重新合成配音 | `重新合成` |
| 复刻音色 | Voice Cloning… | 由作者的录音生成一个音色；“克隆”仍不用于复制文稿 | 克隆音色（命令中） |
| 试听 | Play Sample | 播放音色的示例 | `预听` |
| 调整音频片段 | Adjust Audio Clip | 调整时间线上音频片段的位置与长短；删除片段写“删除 / Delete” | 移除（指删除片段时）、Remove（指删除片段时） |
| 增加缩进 / 减少缩进 | Increase Indent / Decrease Indent | 编辑器的缩进命令 | `Nest`、`Unnest` |
| 左对齐 / 居中 / 右对齐 | Align Left / Center / Align Right | 编辑器的对齐命令 | |
| 删除线 | Strikethrough | 文字格式 | `Strike` |
| 题注 | Caption | 图片、视频等内容块的说明文字：“编辑题注 / Edit Caption” | 标题（指题注时） |
| 标题行 / 标题列 | Header Row / Header Column | 表格的首行与首列 | |
| 可折叠列表 | Toggle List | 可显示或隐藏子项的列表 | |

## 7. 状态词

状态是短语，不加句号；en 用 sentence case。

| zh-CN | English | 含义与用法 | 不用 |
|---|---|---|---|
| 正在保存… | Saving… | 保存进行中 | `保存中…`、`保存中……` |
| 已保存 | Saved | 保存已确认；带时间时写作“已保存 · 10:24 / Saved · 10:24” | |
| 未保存 | Not saved | 有尚未确认保存的输入 | `Unsaved` |
| 保存失败 | Save failed | 保存失败的状态标签；原因写在旁边的消息中 | `没能保存`、Couldn’t save（状态标签中） |
| 正在加载… | Loading… | 读取文稿、页面、列表 | `正在读取`、`载入中`、`加载中……` |
| 正在准备放映… | Preparing presentation… | 由已保存版本准备放映 | `正在编译`、`Compiling` |
| 需要更新 | Update needed | 放映或导出所用版本比当前保存版本旧；命令为“更新 / Update” | `重新编译`、`Recompile`、`Outdated` |
| 排队中 | Queued | 导出等待开始 | `等待中`、Waiting（指排队时） |
| 正在导出 | Exporting | 导出进行中；有进度时写作“正在导出 3 / 10 / Exporting 3 of 10” | 正在生成（指导出时）、`Making` |
| 正在生成 | Generating | 配音合成或 AI 生成素材进行中 | |
| 已完成 | Completed | 导出或生成完成 | Done（指状态时；画笔等工具的“完成 / Done”按钮除外） |
| 导出失败 | Export failed | 导出失败 | 生成失败（指导出时） |
| 已取消 | Canceled | 作者取消的导出或生成 | `Cancelled` |
| 已解决 | Resolved | 已解决的批注 | |
| 已撤消 | Undone | 版本历史中已撤消的修改 | `已撤销` |
| 已过期 | Expired | 待确认的请求已结束或超时 | |
| 未连接 | Not connected | 语音服务或工作区服务未连接 | `断线`、`掉线` |
| 无声播放 | Silent playback | 讲授没有可用的配音、按时长无声播放时的状态 | `静音计划` |
| 待核对 | Unverified | 代码来源条中尚未与当前代码核对的引用；不用“待确认”（它只指 Pending Approvals） | |

## 8. 不在作者界面出现的名称

这些是实现与协议中的名称，作者、讲者与读者的界面、错误与 AI 的回复都不出现，需要时说出作者能看到的结果与下一步。开发者文档、日志、命令行中面向开发者的诊断、“详细信息”中复制的诊断摘要与 VS Code 扩展可以使用。

| zh-CN | English | 含义与用法 | 不用 |
|---|---|---|---|
| （不显示） | （不显示） | 框架与包名 | `dsh`、`DeepSeek Harness`、`Harness`、`bundle`、`插件包`、`@lincyaw` |
| （不显示） | （不显示） | 中间表示与源码；`presmium` 命令行面向开发者的输出说出 IR 文件时写“运行快照 / runtime snapshot” | `IR`、`MyST`、`Markdown`、`源码`、`源文件`、`JSON` |
| （不显示） | （不显示） | 协议与传输 | `MCP`、`SSE`、`RPC`、`HTTP` |
| （不显示） | （不显示） | 任务与计划 | `job`、`jobs`、`plan`、`任务队列` |
| （不显示） | （不显示） | 构建 | `编译`、`compile`、`compiled`、`recompile`、`build` |
| （不显示） | （不显示） | 版本库 | `git`、`commit`、`提交记录` |
| （不显示） | （不显示） | 运行时 | `内核`、`kernel`、`workbench`、`工作台` |
| （不显示） | （不显示） | 标识；插件、步骤与内容块以名称显示 | `ID`、`stepOrder`、`fingerprint` |

“工作台”是仓库文档对 Presmium Studio 的称呼；界面中称应用为“Presmium”，需要区分时写“Presmium Studio”。

## 9. 检查

`node scripts/check-i18n.mjs --strict`（在 `pnpm test` 中）报告：A 键集不一致，B 未翻译，C 违反本文写法或用了“不用”一列的词，D 写在目录之外的界面文字，E 命令行输出与抛出的错误，F 自行判断界面语言之处；A 到 C 有发现即失败。“不用”的词出现在同一行的推荐写法或品牌名之中时不算。BlockNote 的文字按合并覆盖之后的词典检查。逐条判断过的误报连同原因写在 `scripts/check-i18n.allow.json`。Title Case 与动词短语由审阅对照第 3 节判断。
