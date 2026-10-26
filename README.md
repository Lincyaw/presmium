# Presmium

在工作台编辑教学文稿，以 lecture.json 保存唯一内容，编译为网页、幻灯片、Jupyter notebook 与讲授快照。

示例：[用代码讲课](examples/animations/README.md)，保留冒泡排序、代码动画两讲完整中文课程与匹配的讲授缓存，并新增 8 份[功能导览](examples/animations/FEATURES.md)：正文、步骤、代码、课堂、讲稿、发布及可选执行环境。`pnpm demo:check` 检查原有两讲；`pnpm demo:build` 构建整个工作区网页，并为原有两讲补充幻灯片、notebook 与讲授。

## 安装

需要 Node.js 22.19 以上与 pnpm（`corepack enable pnpm`）。第一次全局安装前运行一次 `pnpm setup`。

```sh
pnpm add -g @lincyaw/presmium
```

## 使用

一份讲义：

```sh
presmium new my-lecture     # 新建
cd my-lecture
presmium dev                # 本机预览网页与幻灯片，保存即更新
presmium check              # 检查：文稿结构、链接、代码引用
presmium build              # 构建到 dist/：网页、幻灯片、notebook
```

多份文档组成的工作区：

```sh
presmium new my-course --type workspace
cd my-course
presmium serve              # 文档列表与各文档的站点，http://127.0.0.1:4310
presmium build              # 整个站点构建到 dist/web/
```

工作台（实验性，编辑、预览与 AI agent）：`pnpm add -g @lincyaw/studio`，然后在工作区中运行 `presmium-studio`。

讲义怎么写见[作者指南](site/guide/lecture.json)，插件怎么写见[插件开发指南](site/plugins/lecture.json)。

## 从源码使用

```sh
git clone https://github.com/Lincyaw/presmium.git
cd presmium
pnpm install
pnpm add -g ./packages/presmium
```

之后的 `presmium` 命令运行的就是这份源码。仓库内也可以直接启动浏览器编辑工作台：

```sh
pnpm studio
```

首次自动在 `.presmium/example-workspace` 准备示例的独立副本，后续复用其中的文档。打开终端打印的完整网址（默认端口 4320），即可编辑、保存与预览，不配模型也能使用。用 `pnpm studio <目录>` 打开自己的讲义或工作区，`Ctrl+C` 停止。参与开发见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[Apache-2.0](LICENSE)
