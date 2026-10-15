# Presmium 源语法与中间表示（IR）

本文档定义 Presmium 的编译管线：作者编写的源码如何解析、经哪些编译步骤生成中间表示（IR），以及各渲染端如何从 IR 生成媒介。IR 的 TypeScript 定义见 `packages/kernel/src/ir.ts`，以该文件为准。

## 1. 管线

```
源码（MyST Markdown）+ 真实代码文件
        │  解析：myst-parser → mdast；插件注册的指令把指令节点转为 IR 节点
        ▼
   编译步骤（按顺序执行的 IR 变换）
        │  切分章节 → 划分讲解与上屏内容 → 编排步骤 → 解析代码锚点 → 执行代码并缓存 → 插件步骤
        ▼
   IR（JSON，版本化）
        │
        ├── web       IR 运行时（浏览器内动态渲染）+ VitePress 外壳；主媒介，支持全部节点
        ├── slides    Slidev 幻灯片（可选的高保真渲染端：导出 PDF、绘图、录制）
        ├── notebook  Jupyter .ipynb
        └── 其他渲染端（插件提供）
```

- 所有媒介都从 IR 生成，没有任何媒介直接读取源码。
- 编辑只在源码中进行；渲染产物不回写源码。
- 网页渲染端是参考实现，必须支持全部 IR 节点；其他渲染端可以只支持子集，不支持的节点按第 6 节的降级规则处理。

## 2. 源语法

源语法是 MyST Markdown（CommonMark + 指令 + 角色），由 `myst-parser` 解析。在此之上，Presmium 只增加以下约定。

### 2.1 文档头

入口文件以 YAML frontmatter 开头：

```yaml
---
title: BPE 分词
plugins:                       # 插件包名
  - '@presmium/slidev-addon-code'
  - '@presmium/slidev-addon-exec'
presmium:                      # 各插件的全局配置，键为插件 ID
  presmium.code: { remote: https://github.com/org/repo }
renderers:                     # 各渲染端的配置
  slides: { theme: default }
  web: { search: true }
---
```

多文件文稿用 MyST 的 `{include}` 指令引入。

### 2.2 章节

- `#` 是文稿标题或分章标题，`##` 开始一个章节（可由 `sectionDepth` 配置）。第一个 `##` 之前的内容构成封面章节。
- 一个章节对应幻灯片的一页、网页的一节、notebook 中以标题开头的一组单元格。
- 章节 ID 取自标题前的 MyST 标签 `(bpe-merge)=`；没有标签时由标题生成。章节 ID 是形态切换、笔记挂载、深链接的依据，一经发布不应改变。

### 2.3 文档优先：讲解与上屏内容

源码读起来是一篇讲义。章节中的每个块要么是**讲解**，要么是**上屏内容**：

| 块 | 角色 |
|---|---|
| 普通段落、列表、引用 | 讲解 |
| `:::{slide}` 包裹的内容 | 上屏内容 |
| 代码块、`{code-ref}`、图片、表格、公式、图表、插件指令 | 上屏内容 |

各媒介的呈现：

| 媒介 | 上屏内容 | 讲解 |
|---|---|---|
| 网页 | 按原顺序显示 | 按原顺序显示为正文 |
| 幻灯片 | 显示在页面上 | 成为演讲备注，按步骤切分 |
| notebook | Markdown 或代码单元格 | Markdown 单元格 |

### 2.4 步骤

- 上屏内容默认在第 0 步就显示。
- 指令选项 `:reveal:` 让该块在下一步出现；`{slide}` 上的 `:reveal: items` 让列表逐项出现。
- `{code-ref}` 的 `:steps: a, b, c` 依次高亮逻辑单元，占用 3 步。
- 讲解绑定到它在源码中所处位置的当前步骤：紧跟在某个逐步出现的块之后的段落，属于该块出现的那一步。

### 2.5 媒介限定与提示

```md
:::{only} web, notebook
只在网页和 notebook 中出现的补充推导。
:::

:::{hints}
slides: { layout: two-cols }
web: { layout: scrolly }
:::
```

`{hints}` 放在章节内，为各渲染端提供排版提示；渲染端不认识的提示直接忽略。

### 2.6 示例

````md
(bpe-merge)=
## 合并最频繁的字节对

BPE 每一轮找出出现次数最多的相邻字节对，把它合并成一个新符号。

:::{slide}
:reveal: items
- 统计相邻字节对
- 合并出现最多的一对
:::

```{code-ref} region:src/bpe.py#merge
:steps: count, merge
:run:
```

第一步统计次数，`counts` 的结果显示在代码下方。
````

## 3. IR

IR 是一个 JSON 文档。顶层结构：

| 字段 | 含义 |
|---|---|
| `ir` | IR 版本，当前为 `1` |
| `meta` | 标题、入口文件、语言等 |
| `config` | 插件列表、插件配置、渲染端配置 |
| `sections` | 章节列表 |
| `diagnostics` | 编译中产生的诊断（`Finding`） |

每个章节包含 `id`、`index`（从 1 开始）、`title`、`source`（源码位置）、`steps`（步骤数）、`hints`（按渲染端分组的提示）、`blocks`。

每个块包含：

| 字段 | 含义 |
|---|---|
| `id` | 块 ID，章节内唯一且稳定 |
| `role` | `visual`（上屏内容）或 `narration`（讲解） |
| `at` | 出现的步骤；讲解为其绑定的步骤 |
| `until` | 可选，消失的步骤 |
| `only` | 可选，限定的渲染端 ID 列表 |
| `source` | 源码位置 |
| `node` | 节点内容，见下表 |

节点类型：

| 类型 | 内容 |
|---|---|
| `markdown` | 一棵标准 mdast 子树：段落、列表、表格、公式、图片等 |
| `code` | 语言、代码文本；可选 `origin`（锚点、文件、行区间、锁定提交、永久链接、解析状态、逻辑单元）、`highlight`（每一步高亮的行集合）、`run`（执行规格）、`outputs`（录制的执行结果） |
| `component` | 插件组件：插件 ID、组件名、属性、子块；`fallback` 为静态渲染端使用的 mdast |

IR 只记录语义与已经计算好的结果（例如逻辑单元换算出的高亮行、录制的输出），不记录任何媒介专属的语法。

## 4. 编译步骤

编译步骤（pass）是 IR 上的有序变换。内置步骤：

| 顺序 | 步骤 | 作用 |
|---|---|---|
| 1 | 解析 | 剥离 frontmatter，`myst-parser` 解析，处理 `{include}` |
| 2 | 切分章节 | 按标题切分，生成章节 ID |
| 3 | 指令转换 | 调用各插件注册的指令，把指令节点转为 IR 节点 |
| 4 | 划分角色 | 按 2.3 节判定讲解与上屏内容 |
| 5 | 编排步骤 | 按 2.4 节计算 `at`、`until` 与章节步骤数 |
| 6 | 插件步骤 | 各插件注册的变换，例如解析代码锚点、计算高亮行 |
| 7 | 执行 | 执行带 `run` 的代码节点，结果写入 `outputs`，并写入执行缓存 |
| 8 | 校验 | 按 IR schema 校验，产生诊断 |

### 执行缓存

- 缓存键为 `语言 + 代码 + 参数 + 执行器 ID + 环境指纹` 的哈希。
- 缓存目录为文稿目录下的 `.presmium/freeze/`，可以随文稿提交。提交后，任何人构建都得到相同的输出，也无需安装运行环境。
- 代码改动后只重跑受影响的节点。

## 5. 插件

插件在 Node 端的入口（`./presmium`）导出 `PresmiumNodePlugin`，在第 2 版契约中增加三项：

| 字段 | 作用 |
|---|---|
| `directives` | 指令规格：名称、参数、选项、正文，以及转换为 IR 节点的函数 |
| `passes` | 编译步骤，声明在内置步骤 6 中的先后顺序 |
| `renderers` | 按渲染端提供的扩展，例如 notebook 渲染端把某个组件转换为单元格 |

浏览器端（网页、幻灯片）按 `component` 节点的组件名，查找插件注册的 Vue 组件。组件仍只依赖 `@presmium/host`。

## 6. 渲染端

渲染端实现以下接口：

```ts
interface Renderer {
  id: string                                     // 'web' | 'slides' | 'notebook' | ...
  support(node: IRNode): 'full' | 'degraded' | 'none'
  build(doc: IRDocument, ctx: RenderContext): Promise<RenderOutput>
  dev?(ctx: RenderContext): Promise<RenderDevServer>   // 接收增量 IR
}
```

降级规则：

| 支持程度 | 渲染端的处理 |
|---|---|
| `full` | 正常渲染 |
| `degraded` | 渲染 `component` 节点的 `fallback`；没有 `fallback` 时渲染一行说明并附网页版链接 |
| `none` | 跳过，并在构建报告中列出 |

## 7. 命令

| 命令 | 作用 |
|---|---|
| `presmium build [--to web,slides,notebook] [--out dir]` | 编译并生成指定媒介，默认生成全部已安装的渲染端 |
| `presmium dev [--to web]` | 监听源码，增量编译，启动对应渲染端的开发服务器 |
| `presmium ir [--out file]` | 输出 IR JSON，用于调试 |
| `presmium check` | 编译到第 8 步，只输出诊断 |

## 8. 实时渲染与运行时视图

### 8.1 IR 运行时

`@presmium/viewer` 是浏览器中的 IR 运行时：它读取 IR，用 Vue 动态渲染章节与块，不经过任何 Markdown 生成或静态编译。

- `markdown` 节点：mdast 转为 hast 后渲染为 Vue 虚拟节点；代码高亮用 Shiki，公式用 KaTeX，图表在客户端渲染。
- `code` 节点：按 `highlight` 与当前步骤高亮行，显示录制输出；`run.when` 含 `live` 时接入执行面板。
- `component` 节点：按组件名从插件注册表中取 Vue 组件渲染；组件只依赖 `@presmium/host`。

### 8.2 运行时视图

同一份 IR 可以在运行时以不同视图呈现，切换视图不需要重新构建：

| 视图 | 说明 |
|---|---|
| `document` | 文档式：全部展开，讲解为正文（默认） |
| `scrolly` | 滚动叙事：上屏内容固定一侧，讲解滚动，步骤随滚动推进 |
| `present` | 放映：全屏逐章节、逐步骤；另开窗口为演讲者视图（当前步骤的讲解、下一步预告、计时） |

视图可插拔：插件通过 `registerView` 注册新视图，通过 `registerNodeRenderer` 为节点类型或组件名注册渲染器。

### 8.3 实时更新

```
保存源码 → presmium dev 增量编译受影响的章节 → 比较章节内容哈希
        → 通过 WebSocket 推送变化的章节 → 运行时替换这些章节并重渲染
```

- 不生成文件，不刷新页面；当前视图、章节、步骤与滚动位置保持不变。
- 编译诊断随推送一起到达，在页面上标出出错的章节。
- 目标：保存到画面更新 300 ms 以内（K-11）。

### 8.4 与 VitePress、Slidev 的关系

- **VitePress 是网页的外壳**：提供导航、侧栏、页内大纲、深色模式、移动端适配和搜索界面；页面正文由 IR 运行时渲染；搜索索引在构建时从 IR 文本生成（VitePress 搜索的 `_render` 钩子）。
- **Slidev 是可选的高保真渲染端**：用于导出 PDF、圈画标注、录制等 Slidev 擅长的功能；实时预览不依赖 Slidev。
