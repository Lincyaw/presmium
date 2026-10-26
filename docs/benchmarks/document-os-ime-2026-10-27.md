# Linux 中文系统输入法与保存边界

2026-10-27，用独立 X11 显示、DBus 会话、IBus 拼音引擎和 headed Chromium 验证实际系统输入。
保存调度通过；完整 `zhongwen` 输入仍存在编辑器核心路径的断字问题。本记录不把两者合为输入法全量通过。
保存策略改动与普通输入、旧回执、显式 flush 的验证见 [保存等待记录](document-save-debounce-2026-10-27.md)。

## 环境与输入方式

环境为 TencentOS 4.4、Chromium 156.0.8078.4、GTK 3.24.38、IBus 1.5.28、ibus-libpinyin 1.15.6、libpinyin 2.8.1、Xvfb 21.1.8、xdotool 3.20211022.1。
产品使用原有 BlockNote 0.56.0、Tiptap 3.32.0、ProseMirror view 1.42.7，没有升级或修改依赖。

从已配置的系统仓库下载 49 个 RPM，共 26.8 MiB，解包到任务临时目录。
用 bubblewrap 的只读 `/usr` 合并视图运行原生程序，独立 PID namespace、临时 `/tmp`、XDG 目录和浏览器 profile 隔离会话。
没有全局安装、修改系统配置或触碰其它 display。
IBus 的引擎读取结果为 `libpinyin`；选择命令曾返回 1 且 stderr 为空，因此以实际引擎、候选窗和原生事件链判断，不单凭该退出码宣布失败。

文字由 `xdotool key --clearmodifiers --delay 100` 发送实际 XTEST 按键。
浏览器仅负责打开、点击和观察，没有 CDP 组词、剪贴板粘贴或构造 `CompositionEvent`。
保存了标准 textarea 原始 HTML、XTEST 参数、候选窗截图及所有原生事件。
`compositionstart/update` 与组词 `beforeinput/input` 的 `isTrusted` 为真；此版本 Chrome/GTK 下，标准 textarea 的 `compositionend.isTrusted` 也为假，产品同样如此。
没有修改事件标志或把这一平台差异归为 BlockNote 缺陷。

## 未修复：完整拼音在编辑器中断字

实际输入 `z h o n g w e n` 后按空格，结果如下。

| 真实消费者 | 确认后文字 | 结果 |
| --- | --- | --- |
| Studio 正文，原生 BlockNote 与产品适配器 | 中顾问 | 不通过 |
| 默认 `useCreateBlockNote` + `BlockNoteView`，没有产品适配器或后端 | 中顾问 | 不通过 |
| 公开 `BlockNoteEditor.create().mount()`，没有 React 视图 | 中顾问 | 不通过 |
| 同一 core mount，`animations:false`，不注册 `onChange` 观察器 | 中顾问 | 不通过 |
| 独立原生 contenteditable | 中文 | 通过 |
| 独立标准 textarea | 中文 | 通过 |

Studio 中，`n` 附近原生 text node 被替换，随后 `g` 开始第二段组词。
前后是同一个 X11 焦点窗口、同一个 BlockNote 实例和段落 DOM，Workbench reset 为 0，修饰键均未按下。
组词期间没有保存；确认后真实 CAS 保存了错误的“中顾问”，并非磁盘正确而观察器读错。
默认 React 与 core 对照都复现，因此当前证据将范围缩到 BlockNote/core/ProseMirror 编辑路径，尚不能进一步确定具体依赖代码或给出修复。
公开禁用动画没有解决问题，本次没有把该选项改入产品，也没有尝试依赖补丁或盲目升级。
下一步最小定位应复用同一公开 core consumer 和原 XTEST 参数，对比 ProseMirror 版本或公开扩展组合；保持输入机制不变，先证实责任路径，再决定产品措施。

原始记录在忽略目录 `.presmium/ui-evidence/`：`os-ime-studio-observed-before.json`、`os-ime-native-controls.json`、`os-ime-core-controls.json`、`os-ime-core-noanimations.json`。
这些消费者的 `complete:true` 只表示比较结束，逐项 `exactChinese:false` 如实保留。
截图存在同名覆盖，不能替代对应 JSON 的身份：`os-ime-plain-contenteditable.png` 最后由后续 `hao` 消费者写入，画面为“好”，已另存 `os-ime-hao-control-final.png`，不是此前“中文”对照的截图。
`os-ime-core-blocknote.png` 最后对应 `animations:false` 消费者。
原 JSON 未改写；文件时间、SHA 和消费者映射另记 `os-ime-screenshot-index.json`。此前 contenteditable 的“中文”结论依据其原生事件与最终值记录，不引用被覆盖的截图。

## 通过：真实组词确认后重新等待保存

另用 `h a o` 验证保存调度。实际候选第 1 项为“号”、第 2 项为“好”，通过原生数字键 2 确认“好”。
最初把未确认候选硬断言为“好”的消费者失败，保留为 `os-ime-debounce-candidate-before.json`，未计入通过项。

冻结后的产品源码使用真实私有 Studio、workspace 服务和规范文稿 CAS，`os-ime-debounce-after.json` 完整 **9/9**。

| 场景 | 实际结果 |
| --- | --- |
| 真实拼音组词后停顿 800 ms | 两段均 0 POST，磁盘保持原文 |
| 首次候选确认 | 605 ms 后发出首个保存请求；原生正文与磁盘精确为“好” |
| 第二次候选确认后继续输入原生句号 | 末次 input 后 605 ms 保存；距组词结束 1019 ms |
| 最终正文、磁盘与光标 | “好好。”；光标偏移 3，选区折叠 |
| 保存与界面 | 2 次 POST，均 200；单 BlockNote、仍处于 Doc，0 浏览器错误与 HTTP 失败 |

原始断字链在保存策略修复前测得 compositionend 到首个 POST 为 8 ms；该链整体失败，不能作为中文输入通过证据。
以上 605 ms 来自实际原生事件与请求的 `Date.now()`，没有替换时钟。
本消费者没有重复旧 ACK 测试；其独立真实结果在保存等待记录中。

## 复现入口

忽略目录保留 `.presmium/os-ime-launch.py`、`os-ime-runtime.py`、`os-ime-control.html` 和各消费者。
启动器需要先依据 `os-ime-environment.json` 的精确包清单重建私有解包目录、schema、GTK IM 模块配置与权限 600 的任务 metadata；本轮这些环境文件已经删除，不能直接复用旧凭据。
在上述隔离环境准备后，从仓库根目录运行本轮实际使用的入口：

```sh
OS_IME_CONSUMER=.presmium/os-ime-core-controls.mjs python3 .presmium/os-ime-launch.py
OS_IME_CONSUMER=.presmium/os-ime-debounce.mjs python3 .presmium/os-ime-launch.py
OS_IME_CONSUMER=.presmium/os-ime-core-noanimations.mjs python3 .presmium/os-ime-launch.py
```

三条命令顺序执行，每次退出都会结束该次 PID namespace 内的原生程序；不得并行复用 display。

## 清理与范围

消费者、日志、原始 HTML、截图和 JSON 均在忽略目录，权限为 600，未公开启动 URL 或凭据。
所有自有浏览器、Studio、Xvfb、IBus 与 DBus namespace 已结束，私有端口关闭；临时 profile、凭据、解包 runtime、RPM 与仓库缓存全部删除，包清单和清理结果留在 `os-ime-environment.json`、`os-ime-final-cleanup.json`。
没有修改用户文稿、公共 4320/17407、全局客户端构建或产品编辑适配器，没有调用模型、付费服务、新增 tracked tests 或运行测试套件。
本轮只验证这一套 Linux/X11/IBus/Chromium 环境，不宣称其它系统输入法、OS、浏览器或所有中文字词已验证。
