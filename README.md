# Presmium

用 MyST Markdown 写讲义，生成网页、幻灯片、Jupyter notebook 与带语音的讲授。

示例：[示例工作区](https://lincyaw.github.io/presmium/)，[示例讲义](https://lincyaw.github.io/presmium/demo/)（网页、[幻灯片](https://lincyaw.github.io/presmium/demo/slides/)、[notebook](https://lincyaw.github.io/presmium/demo/notebook/)）。

## 安装

需要 Node.js 22.19 以上与 pnpm（`corepack enable pnpm`）。第一次全局安装前运行一次 `pnpm setup`。

```sh
pnpm add -g presmium
```

## 使用

一份讲义：

```sh
presmium new my-lecture     # 新建
cd my-lecture
presmium dev                # 本机预览网页与幻灯片，保存即更新
presmium check              # 检查：指令、链接、代码引用
presmium build              # 构建到 dist/：网页、幻灯片、notebook
```

多份文档组成的工作区：

```sh
presmium new my-course --type workspace
cd my-course
presmium serve              # 文档列表与各文档的站点，http://127.0.0.1:4310
presmium build              # 整个站点构建到 dist/web/
```

工作台（实验性，编辑、预览与 AI agent）：`pnpm add -g @presmium/studio`，然后在工作区中运行 `presmium-studio`。

讲义怎么写见[作者指南](site/guide/lecture.md)，插件怎么写见[插件开发指南](site/plugins/lecture.md)。

## 从源码使用

```sh
git clone https://github.com/Lincyaw/presmium.git
cd presmium
pnpm install
pnpm add -g ./packages/presmium
```

之后的 `presmium` 命令运行的就是这份源码。参与开发见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[Apache-2.0](LICENSE)
