# 没有模型时的 AI 助手

2026-10-28，在分支 `work/assistant-no-model-2026-10-28` 上做真实运行验证。处理的缺陷：没有设置模型时，作者在 AI 助手中输入请求并按 Enter，发送按钮可用、会话照常开始，这一轮以 `This turn failed llm-deepseek: MISSING_CREDENTIAL no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY …` 结束，输入区仍显示“Select model”。这违反 [UI/UX RFC 1.1 节](../rfc-workbench-uiux.md#11-web桌面与-vs-code)：作者不应看到技术错误与命令，错误要简短、用作者的话并给出恢复操作。

Studio 从该分支源码启动（`presmium-studio <工作区> --port 4338 --host 127.0.0.1`），`XDG_STATE_HOME` 指向本次验证的临时目录，所以 dsh 的设置与凭据都是隔离的新目录，启动环境中没有任何模型密钥。工作区由 `examples/animations/try.mjs` 新准备，文稿为“冒泡排序”。浏览器是 Playwright Chromium。唯一的模型请求是用一把虚构的密钥（`sk-presmium-invalid-key-0000`）发出的一次，被 DeepSeek 以认证失败拒绝，不产生费用。

## 改动

- **判断有没有可用的模型**：读 dsh 的 `session/modelCatalog`（模型选择器读的同一份目录）。没有密钥时它的回答是 `{"default":{"provider":"deepseek-official","model":"deepseek-flash"},"routableProviders":[],"groups":[],"failures":[]}`，`routableProviders` 为空即没有任何可用模型；输入区的模型菜单此时显示“No models available.”。
- **输入区**：没有可用模型时向 `conversation.composer` 登记接管项，显示“AI 助手需要先设置模型”与唯一的操作“设置模型”；有了模型就撤下。默认输入区留在接管项下面，草稿不丢。
- **打开“模型”页**：沿用首次使用提示的路径，即 dsh 交给引导步骤的 `openSection('models')`。
- **失败的一轮**：替换 `conversation.chat.node` 的 `turn-error` 单元，按失败代码用作者的话说明，需要去“模型”页修复的带操作，原文收在默认折叠的“技术详情”中。
- **工作台交给 AI 的请求**（批注、“让 AI 处理”）在没有可用模型时不提交。
- **dsh 自己的语言**：在设置中选 dsh 的“English”“中文”时切换为“English (Presmium)”“简体中文（Presmium）”。

实现与限制见 [dsh 设计 10.1 节](../design-dsh.md#101-缺少模型与失败的一轮)。

## 修改之前

| 操作 | 结果 |
| --- | --- |
| 没有模型，打开 AI 助手 | 输入区可编辑，发送按钮可用，模型处显示“Select model”；模型菜单为“No models available.” |
| 输入“Add an everyday example to section 2”并按 Enter | 输入区清空，会话开始，约 1 s 后显示红点行“This turn failed llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY through the credentials service …”与代码 `MISSING_CREDENTIAL` |

## 实际运行（修改之后）

英文界面，1440×900，时间从打开页面起算：

| 步骤 | 结果 |
| --- | --- |
| 没有模型，打开 AI 助手并新建对话（6.3 s） | 输入区换成“The AI assistant needs a model / Set up a model, then tell the AI in your own words what to change. Anything you have typed stays here.”与按钮“Set up a model”；编辑器与发送按钮不可见，不能发出请求 |
| 点“Set up a model”，关掉后再点一次（7.5 s、9.6 s） | 两次都打开设置并停在“Models”页 |
| 在“Models”中填入虚构密钥并 Apply，关掉设置（12.8 s） | 接管项撤下，输入区恢复，模型处显示 DeepSeek 的模型 |
| 输入草稿，不发送（14.5 s） | 编辑器内容为“Add an everyday example to section 2” |
| 在隔离的凭据文件中删掉这把密钥，重新载入（26.4 s） | 接管项回来，覆盖着有草稿的输入区 |
| 点“Set up a model”，再填入密钥并 Apply（27.7–30.3 s） | 接管项撤下，草稿仍是“Add an everyday example to section 2” |
| 按 Enter 发送（31.8 s） | 这一轮被拒绝，失败行显示“The model did not accept your key / This request did not finish: the model service refused the key in Settings. Check or re-enter it in the model settings, then send again.”与按钮“Check model settings”；展开“Technical details”才看到“Authentication Fails, Your api key: ****0000 is invalid (request_id: …) · AUTH” |
| 点“Check model settings”（33.1 s） | 打开设置并停在“Models”页 |
| 打开修改之前那次失败的对话 | 原来的 `MISSING_CREDENTIAL` 行显示为“The AI assistant needs a model / This request was not sent: no model is set up yet. Set one up, then send it again.”与“Set up a model” |
| 设置 → General → 语言选“English”，再选“中文” | 分别变为“English (Presmium)”（`<html lang="en-US">`）与“简体中文（Presmium）”（`zh-CN`） |

保存密钥之后接管项在 1–3 s 内撤下：dsh 转来的事件在这次运行中没有观察到，撤下来自没有可用模型时每 3 s 一次的重读。删掉密钥后、页面重新载入或窗口重新获得焦点之前，输入区不会自己换成说明。

## 显示

zh-CN 与 en，亮色与暗色，1440×900 与 390×844，八种组合都打开过两种状态：没有模型（输入区的说明与旧对话的“需要先设置模型”失败行）、密钥被拒绝（“模型没有接受当前的密钥”与“检查模型设置”）。说明卡与输入区同宽、同样留出边距，窄屏时占满对话列；失败行用 `--pm-color-warn-soft` 底色与警示图标，暗色下对比清楚；中文文案在 390 宽时正常折行。截图留在本次验证的临时目录，未提交。

## 未验证

- “让 AI 处理”与批注发送在没有模型时的拦截：当前文稿没有诊断，界面中也没有发送批注的入口，没有在浏览器中触发。
- 额度用完、服务繁忙、对话过长、工作台重启中断的失败行：没有制造这些失败。
- 浏览器语言为 en-GB 等只按主子标签匹配 dsh 的 English、且从未存过语言时，对话首页仍是 dsh 的文案（见 dsh 设计 10.1 节）。

## 结构检查

`check-types`、`check-layering`、`check-tokens`、`check-skills`、`check-plugins` 均通过。未运行测试套件、e2e 或示例完整构建。
