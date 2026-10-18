# Presmium

Presmium turns a lecture written in [MyST Markdown](https://mystmd.org) into web pages, slides, Jupyter notebooks and narrated lectures. The source is plain text that lives next to the code it explains: a lecture can quote the repository's real code, run its code blocks when it is built, and let readers run them in the browser. A compiler turns the source into an intermediate representation (IR); pluggable renderers make each medium from it, and the same plugin components work on the web page and in the slides.

Presmium is a component library and toolchain, not a hosted service. Think of an enhanced JupyterLab: you write, preview, present and publish on your own machine (or in your own container), readers get static sites, and sharing means sharing files, with collaboration through git.

Examples, rebuilt on every push to `main`: <https://lincyaw.github.io/presmium/> is the example workspace (`examples/workspace`) as a static site, its home page listing the documents; <https://lincyaw.github.io/presmium/demo/> is the lecture in `examples/demo` as a web page, slides (`demo/slides/`) and notebooks (`demo/notebook/`). Creating, editing and managing documents takes `presmium serve` on your own machine.

[中文说明](#中文)

## What it does

- **One source, four media**: a static web site with search (VitePress), Slidev slides with PDF and PNG export, Jupyter notebooks, and narrated lectures synthesized from the narration.
- **Steps and narration**: on-screen content appears step by step, and each paragraph of narration belongs to a step; the web page, the slides and the lecture follow the same steps.
- **Real code**: `{code-ref}` quotes code by region, symbol or pattern, pinned to a commit and checked for drift; code runs at build time (cached and, on Linux hosts that qualify, sandboxed), in the browser (Pyodide, WebAssembly for C, C++, Ruby and SQL, WebGPU), in a local container or on a remote Jupyter server.
- **Publishing**: publication checks for dead links and fragments, a students' version without the teachers' content, translations with a language menu, and workspace sites of several documents.
- **Reader questions**: readers ask an AI about the section they read, with a model service they set up themselves, from the browser; the site needs no server.
- **Plugins**: components, directives, services, server routes, views and renderers all come from plugins, official or your own.

None of the core (the syntax, the IR, the compiler, the renderers, the CLI) or the outputs needs a model service.

## Getting started

Presmium needs Node.js 22.19 or later.

```sh
npm create presmium@latest
```

asks which kind of project you want (a lecture, a workspace or a plugin) and writes it. Or install the command and the renderers into a project yourself:

```sh
npm install -D @presmium/cli @presmium/web @presmium/render-slides @presmium/render-notebook @presmium/slidev-addon-core
npx presmium check      # compile and check the lecture in this directory (lecture.md)
npx presmium dev        # dev servers that update as you save
npx presmium build      # dist/ir.json and dist/<renderer>/
```

The 1.0 packages are release candidates (`1.0.0-rc.*`) until the first release.

### The local workbench (preview)

`presmium serve` starts a workbench on your machine for a workspace of documents: a live site, editing the source in the browser, managing documents, the history of changes, and changes by an AI agent that you review before they are committed. It is for one user on their own machine. Its browser interface is a preview and will be replaced by a new workbench, separate from the outputs. The `presmium serve` command and the workspace configuration file stay; see [docs/api.md](docs/api.md) for what is stable.

## Documentation

- The documentation site, in Chinese and English, is a Presmium workspace in [site/](site/): the [author guide](site/guide/lecture.en.md), the [plugin guide](site/plugins/lecture.en.md) and [interfaces and versions](site/reference/lecture.en.md). Build it with `pnpm --filter presmium-docs build` (it also generates the API reference with TypeDoc).
- [docs/api.md](docs/api.md): the public and experimental interfaces and the version rules (semver, `IR_VERSION`, `KERNEL_VERSION`, plugins' peer dependencies).
- The design documents in [docs/](docs/) (IR, domain model, architecture, the workbench) are in Chinese.
- Each package's README says what it is for; [.changeset/README.md](.changeset/README.md) lists every package.

## Contributing, security, license

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and conventions and [SECURITY.md](SECURITY.md) for reporting vulnerabilities and the trust model. Presmium is licensed under the [Apache License 2.0](LICENSE); [NOTICE](NOTICE) lists the third-party software it redistributes.

## 中文

Presmium 把用 MyST Markdown 写的讲义编译为中间表示（IR），再生成网页、幻灯片（Slidev）、Jupyter notebook 与带语音的讲授。讲义是纯文本，与它讲解的代码放在同一个仓库里：可以引用真实的代码、在构建时运行代码、让读者在浏览器中运行。组件、指令、服务与渲染端都以插件提供，插件组件在网页与幻灯片中共用。

Presmium 是组件库与工具链，不是托管产品：像一个增强的 JupyterLab，作者在自己的机器（或自己的容器）中编写、预览、讲授与发布，读者阅读构建出的静态站点；分享就是分享文件，协作通过 git。核心（语法与 IR、编译器、渲染端、CLI）与产物不需要任何模型服务。

示例（每次推送到 `main` 时重新构建）：<https://lincyaw.github.io/presmium/> 是示例工作区（`examples/workspace`）的静态站点，首页是文档列表；<https://lincyaw.github.io/presmium/demo/> 是 `examples/demo` 中的讲义构建出的网页、幻灯片（`demo/slides/`）与 notebook（`demo/notebook/`）。新建、编辑与管理文档要在自己的机器上运行 `presmium serve`。

开始：`npm create presmium@latest`，或在项目中安装 `@presmium/cli` 与渲染端后运行 `npx presmium check`、`dev`、`build`。本机工作台 `presmium serve` 是预览，浏览器界面会被新的工作台取代，命令与工作区配置文件保持不变。

文档：[作者指南](site/guide/lecture.md)、[插件开发指南](site/plugins/lecture.md)、[接口与版本](site/reference/lecture.md)（文档站在 `site/`，`pnpm --filter presmium-docs build` 构建），公开接口与版本规则见 [docs/api.md](docs/api.md)，设计文档在 [docs/](docs/)。参与开发见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)。许可证为 Apache-2.0。
