# 文档字幕的简短提示原子

2026-10-27，在独立随机端口 Studio 的私有 `bubble-sort` 副本验证；英文另用独立文稿身份与 `metadata.lang=en` 的副本。没有写入 4320 或作者文稿。

## 范围

`NarrationEditor` 已有 `advanced` 区分。原 cue 分支未使用它，basic 文档仍显示 `提示 · spot/click`，原生 title 还显示 cueId。本次仅在 cue 分支增加 `advanced === false` 的早返回，使用原有 cue span 与本地化 `提示／Cue`，不设置 title。advanced 分支、schema、原子 props、转换器、保存器和样式均未改动。

Figma [NarrationEditor](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=107-1820) 原有 Document／Production 八态；本次补 `State=Cue` 两态（Document `186:4357`，Production `186:4364`），[明暗对照](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=186-4375)复用 cue 的现有文字、颜色、间距与圆角令牌。没有新增图标、业务 CSS 或 cue 动作工具。原有 Document 节点同时补入 registry。

## 真实验证

`document-cue-native.json` 完整 **26/26**，脚本为忽略目录内的 `document-cue-consumer.mjs`：

- 亮暗×1440/390，真实文档内选择第 3 步并展开字幕：标签仅 `提示`、title 缺失、原子 `contentEditable=false`，没有发音工具。
- 每组实际进入 Video：标签仍为 `提示 · spot`、title 为原 cueId，原发音工具保留；native cue props 的 payload 字符串与 cueId 逐项完全相等。
- 原生 Shift+ArrowLeft 范围精确覆盖 size=1 的 inline atom；ArrowLeft 将范围折叠到 cue 前边界，再插入邻接文字。三次 CAS 分别确认插入、原生 Undo、Redo；只改该 Narration 的文字，其他规范字段和全部 cue／pronunciation 原子相等。
- 英文真实文稿另证 basic `Cue`／无 title，以及 advanced `Cue · spot`／原 cueId title。该附加语言样本继承深色 profile，不作为第五种主题组合。

共 3 次私有文字保存，0 语音生成请求、浏览器错误或 HTTP 失败。Video 在本轮只验证编辑器与原子信息；修改讲稿后的计划估计／缺缓存和取消提示原样保留，没有把播放算作通过。没有请求生成音频。

basic／advanced 四组合共八图与英文两图已逐张查看，文件为 `document-cue-{basic,advanced}-{locale}-{theme}-{width}.png`。英文文件名中的 light 是运行标签，实际继承深色，记录已注明。

首轮误把 inline atom 的普通鼠标点击要求成 NodeSelection，实际它将光标放在原子旁；失败另保 `document-cue-native-click-harness.json`。第二次用 Control+Home 与逐字符方向键放置插入点，采样仍为旧范围、没有满足所需边界，记录另保 `document-cue-native-adjacent-harness.json`。最终使用现有原生范围选择与折叠动作，没有改产品选择语义。

类型检查通过（1168 files），未运行测试套件或新增 tracked tests。只读观察器只在私有 bundle，保留 Workbench 原行为；native 数据从公开字段 getter 与 ProseMirror 状态读取。源与产物 SHA／观察器 diff 见 `document-cue-build.json`，自有服务、浏览器、临时 workspace 与凭据 metadata 清理见 `document-cue-cleanup.json`。
