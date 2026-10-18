# 版本与发布

Presmium 的包用 [Changesets](https://changesets.dev) 管理版本与变更记录（P-141）。公开的包（`@presmium/*` 与 `create-presmium`）是一组固定版本（`config.json` 的 `fixed`），一起发布、版本相同；1.0 从 `1.0.0-rc.0` 开始，处在预发布模式（`pre.json`，标签 `rc`）。源码以 `.ts`、`.vue` 直接发布，不预编译；各包内部的依赖写 `workspace:`，发布时换成版本：`workspace:*` 成为确切的版本，插件对 Presmium 的对等依赖 `workspace:^` 成为 `^<版本>`。

## 哪些包发布

下表列出工作区的每个包，`scripts/check-packages.mjs`（`pnpm test` 的一部分）按它检查：公开的包有 Apache-2.0 许可证（`license` 字段与包内的 `LICENSE`）、同一个版本、与根目录一致的 `engines.node`、完整的元数据（`description`、`repository`、`homepage`、`bugs`、`keywords`、`publishConfig`），`files` 只含发布所需并包含 `exports` 与 `bin` 指向的文件；插件（有 `./presmium` 入口的包）对 `@presmium/kernel`、`host`、`viewer`、`compiler` 的依赖是对等依赖，与应用共用一份。

| 包 | 发布到 | 说明 |
|---|---|---|
| `@presmium/kernel` | npm | 共享内核：IR 与插件契约、服务注册、锚点、检查 |
| `@presmium/host` | npm | 插件组件的宿主接口与设计系统（令牌、组件、字体） |
| `@presmium/compiler` | npm | MyST 到 IR、插件加载、编译时执行、检查与渲染端调度 |
| `@presmium/cli` | npm | `presmium` 命令；`./testing` 供插件的集成测试运行 CLI |
| `@presmium/viewer` | npm | IR 运行时 |
| `@presmium/web` | npm | 网页渲染端 |
| `@presmium/render-slides` | npm | 幻灯片渲染端与默认主题 |
| `@presmium/render-notebook` | npm | notebook 渲染端 |
| `@presmium/server` | npm | `presmium dev` 与 `presmium serve` 的服务端 |
| `@presmium/mcp` | npm | agent 环境（MCP）与 `presmium-mcp` |
| `@presmium/workspace` | npm | 工作区服务 `presmium serve` |
| `@presmium/language-server` | npm | 语言服务 |
| `@presmium/classroom-server` | npm | 课堂同步服务 |
| `@presmium/slidev-addon-core` | npm | 插件：幻灯片形态的宿主适配 |
| `@presmium/slidev-addon-stage` | npm | 插件：讲台 |
| `@presmium/slidev-addon-code` | npm | 插件：代码引用 |
| `@presmium/slidev-addon-exec` | npm | 插件：执行面板与浏览器中的 Python |
| `@presmium/slidev-addon-exec-local` | npm | 插件：本地容器 |
| `@presmium/slidev-addon-exec-wasi` | npm | 插件：WebAssembly 运行时 |
| `@presmium/slidev-addon-exec-webgpu` | npm | 插件：浏览器 GPU |
| `@presmium/slidev-addon-exec-jupyter` | npm | 插件：远端 Jupyter 环境与浏览器终端 |
| `@presmium/slidev-addon-guide` | npm | 插件：引导 |
| `@presmium/slidev-addon-content` | npm | 插件：富内容 |
| `@presmium/slidev-addon-publish` | npm | 插件：离线、高对比度、导出与视觉差异 |
| `@presmium/slidev-addon-session` | npm | 插件：课堂会话与同步 |
| `@presmium/slidev-addon-classroom` | npm | 插件：课堂功能 |
| `@presmium/slidev-addon-assistant` | npm | 插件：AI 助手与读者问答 |
| `@presmium/slidev-addon-deltabox` | npm | 插件：修改审阅与进程沙箱（随 CLI 安装） |
| `@presmium/slidev-addon-lecture` | npm | 插件：讲授轨与导出视频 |
| `@presmium/slidev-addon-speech` | npm | 插件：语音服务 |
| `@presmium/dsh` | npm | DeepSeek Harness 的 bundle：工作台的宿主部分（工具、确认策略、文稿上下文、技能、路由）；0.x、实验性，版本号不随统一版本（`docs/design-dsh.md` 12 节），技能在打包时从 `.agents/skills` 复制 |
| `create-presmium` | npm | `npm create presmium@latest`：新建讲义、工作区或插件项目（不在 `@presmium` 作用域中：`npm create presmium` 运行的就是这个名字的包；它的模板在打包时从各自的源复制，见包内 `templates/README.md`） |
| `presmium-vscode` | 否 | VS Code 扩展：预打包为 `.vsix`，发布到扩展市场，不发布到 npm |
| `presmium-demo` | 否 | 示例讲义（`examples/demo`） |
| `presmium-example-workspace` | 否 | 示例工作区（`examples/workspace`） |
| `presmium-docs` | 否 | 文档站（`site/`），一个 Presmium 工作区，`pnpm --filter presmium-docs build` 构建 |

不在工作区中的测试替身也不发布：`packages/*/test/fixtures/**` 与 `e2e/fixtures/**` 中的插件与文稿都是 `private`，例如消费者安装测试的第三方插件 `presmium-plugin-hello`（`e2e/fixtures/consumer/plugin`）。`packages/render-slides/theme` 是幻灯片的默认主题，随 `@presmium/render-slides` 发布，不单独发布。

## 记录一处修改

改动了公开的包时，在提交中加一个变更记录：

```sh
pnpm changeset          # 选包与升级类型（patch、minor、major），写一句面向使用者的说明
```

它在 `.changeset/` 中写一个 Markdown 文件，随提交入库。只改测试、文档或示例时不需要。

## 发布（维护者）

1. `pnpm changeset version`：按累积的变更记录升级全部公开包的版本（预发布模式中为 `1.0.0-rc.<n>`），写各包的 `CHANGELOG.md`；然后 `pnpm install` 更新锁文件，提交。
2. `pnpm release:check`：`pnpm -r publish --dry-run --no-git-checks`，按发布的样子打包每个公开的包而不上传。消费者安装测试用同样的压缩包在单仓之外的项目中安装、检查、构建与运行：`pnpm test` 中的 `packages/cli/test/consumer.test.ts`，`pnpm e2e` 中的 `e2e/consumer.spec.ts`；`pnpm consumer [<目录>]` 单独做一个这样的项目。
3. `pnpm changeset publish`：发布版本尚不在 npm 上的包（预发布模式中带 `rc` 标签，`npm install @presmium/cli` 不会装到它），然后 `git push --follow-tags`。
4. 正式的 1.0.0：`pnpm changeset pre exit`，再走一遍 1 至 3。

`1.0.0-rc.0` 已经写在各包中，第一次发布从第 2 步开始。

## 第一次发布前由用户完成的步骤

这些步骤需要账号与凭据，不由开发流程完成：

- GitHub 仓库 `Lincyaw/presmium`（与各包 `repository` 一致）已创建并推送（2026-10-18，远端 `origin`）；Actions 运行 `.github/workflows/ci.yml`，`.github/workflows/pages.yml` 把示例发布到 GitHub Pages（<https://lincyaw.github.io/presmium/>）。
- 在 npm 创建组织 `@presmium`，为发布者创建令牌（或登录 `npm login`）；在 CI 中发布时把令牌存为仓库的 secret。
- 实际发布：`pnpm changeset publish`（见上）。
