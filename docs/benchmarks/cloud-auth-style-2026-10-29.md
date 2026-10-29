# 云端顶栏与身份页视觉统一

2026-10-29。针对云端右上角原生语言选择器、松散的页头，以及默认 Keycloak 注册页与工作台不一致的问题，保留官方认证流程，统一公共设计与图标操作。验证对象是 `ssh team` 上的 `presmium-cloud-verification` 项目，通过 SSH 转发在浏览器打开四个 `.localhost:18787` 域名。未修改其他部署。

最终 API 镜像为 `sha256:1df6827c86956ea924aaa83abcb2c305bd97b4b281696fd50835e31c4dc03cd7`，Keycloak 镜像为 `sha256:5397c5347cf1ce101e5ff0d698bb026d24cc1afe90c03412fc3cefad0db069f0`；两者最终健康检查均为 healthy。执行代理和看门狗沿用上一轮运行镜像，本轮没有执行任务或更改其配置。

## 改动与可核实范围

- 顶栏复用原工作台 P 标志与公共应用栏样式，语言使用带勾选态的公共菜单，明暗使用图标按钮，账号菜单承接身份说明与退出操作。采用 Radix 工具栏、菜单、Tooltip、焦点归还及方向键行为。
- 身份主题继承 Keycloak 26.8.1 `base`，FTL 覆盖为 0。字体、颜色、尺寸与控件来自 `@lincyaw/design`；语言图标保留原菜单节点、ARIA 和官方事件，密码显示继续由官方脚本控制。
- 两套消息各 62 个同集键，其他消息继承官方翻译。字体 16 份本地 WOFF/WOFF2，附 3 份 OFL、原品牌 Apache 与 Lucide 许可证；CSS 没有外链字体。
- CSS 和自定义脚本的最终内容生成独立文件指纹。首次实页发现固定资源名长期缓存后修正构建入口，普通页面导航即可加载新资源；官方继承的菜单和密码脚本保持原路径。
- 已存在 realm 仅更新 `loginTheme`，GET 回读为 `presmium`；其他完整 realm JSON 的 SHA256 前后一致：`6fce0cc1f0a1c12a260f130fb391bff731b2774e2881febbec24d03ba0696121`，未重新导入 realm。

## 真实浏览器与构建验证

亮色、暗色 × 默认桌面、390 × 844 窄屏，实际查看云端顶栏与注册页。窄屏注册页测得 `scrollWidth = clientWidth = 390`。语言菜单切换中英文后，勾选态、页面标题和文案对应更新；工具栏 → 方向键能移到明暗按钮，Esc 关闭菜单后焦点归还语言按钮。

从应用进入注册页时传入白名单 `ui_locales` 与 `ui_theme`，身份页相应显示中文与选定明暗。注册页空提交出现真实字段错误，密码显示按钮切换为 Hide Password 且 input type 变为 text。登录、返回登录、找回密码表单沿用公共视觉；未输入凭据、创建新账号或发送重置邮件。账号菜单的退出路径由独立代码审查覆盖，本轮未重新执行带凭据登录和退出。

最终浏览器直接从应用重新进入身份页，已看到语言 SVG 和 `语言 · 简体中文` 提示，以及 `brand.18625db54f8f50de.js`、`appearance.af5f2a8996d1bd3f.js` 引用；没有清浏览器缓存或关掉服务缓存。新图标下实际打开原生语言菜单、切到英文、返回登录并打开找回密码成功。最终注册四组合截图均包含图标入口，登录与找回密码另查看暗色窄屏。

本地和 Linux 的真实主题构建、Linux 云端 Vite 构建、针对云端入口的严格 TypeScript 检查通过。`check-tokens`（49 份样式，含身份布局）、`check-layering`、`check-skills`、`check-i18n --strict` 通过。两名独立代理审查认证参数、原生菜单兼容、公共控件、静态 SVG、字体路径与指纹构建，未发现阻断问题。遵循仓库要求未新增测试，未运行测试套件。

## 截图

| 页面 | 亮色桌面 | 暗色桌面 | 亮色窄屏 | 暗色窄屏 |
|---|---|---|---|---|
| 云端顶栏 | [截图](auth-style-2026-10-29/app-light-desktop.jpg) | [截图](auth-style-2026-10-29/app-dark-desktop.jpg) | [截图](auth-style-2026-10-29/app-light-narrow.jpg) | [截图](auth-style-2026-10-29/app-dark-narrow.jpg) |
| 注册页 | [截图](auth-style-2026-10-29/register-light-desktop.jpg) | [截图](auth-style-2026-10-29/register-dark-desktop.jpg) | [截图](auth-style-2026-10-29/register-light-narrow.jpg) | [截图](auth-style-2026-10-29/register-dark-narrow.jpg) |

[修改前顶栏](auth-style-2026-10-29/before-app.jpg)、[修改前注册页](auth-style-2026-10-29/before-register.jpg)、[菜单](auth-style-2026-10-29/app-light-desktop-menu.jpg)、[真实字段错误](auth-style-2026-10-29/register-validation.jpg)。
