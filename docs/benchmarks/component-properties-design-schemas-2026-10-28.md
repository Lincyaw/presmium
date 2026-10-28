# 组件属性正式设计与示例参数声明

本片基于 `c9064468efbb41a7ae0ad55ffbece2f0c758d2fe`，只增加正式设计索引和示例的 `Definition.parameterSchema`，不包含属性 Dialog、表单或共享事务的运行时实现。

## 正式组合

Figma [ComponentProperties](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=278-5945) 位于正式控件页 `21:2`；[审阅图](https://www.figma.com/design/CjQ5JFn3PuGXx0NgwYrCR8?node-id=278-5946) 包含 24 个实例。六种状态分别为基础参数、当前步骤、无公开字段、校验错误、来源变化、保存中；每种都有 Compact／Touch、亮／暗组合。亮色实例为中文，暗色实例为英文。桌面对话框宽 640，窄屏以 390 视口中的 358 宽组合展示；这些是设计取样尺寸，不是运行时内联数值。

组合复用现有公共字段、按钮、图标按钮和 Product 变量，保留原 `PmDialog` 组件 `25:565`。标题使用现有字体资源 Noto Serif SC／Source Serif 4，补两个对应现有标题角色的文字样式；正文复用 Noto Sans SC。没有新图片、图标资产或业务样式。实际看过完整审阅图：首图发现英文长动作文字被旧按钮实例固定宽度裁切，随后只将审阅实例缩短为 `Materials`／`Review`；最终图文字完整，程序读回无被裁按钮标签。未改动公共按钮主组件。

属性按“基础参数／当前步骤”分开保存待应用输入；继承影响只显示真实数量，基础修改保留已有步骤覆盖。“素材与引用”复用 I03，不将普通参数修改变成素材分叉。缺少实现依赖闭包时，独立副本能力保持不可用；没有制造已成功复制实现的状态。来源变化保留输入，显式重新检查；保存中复用 disabled／loading，不增加确认链。

## 示例 schema

11 份顶层示例共有 38 个定义，其中原来只有 4 个定义声明 `properties`。本片改动七份导览的 22 个定义；剩余无作者参数或仅有实现、身份、编码数据的定义保持原状。

| 导览 | 声明范围 | 对照的真实接口 |
|---|---|---|
| 步骤与动画 | 计数文字、既有数值范围、提示标题和文字；交互目标只读 | 项目 `ActionCounter.tsx`／`semantic.ts`，`addon-guide` 的 `CueProps` |
| 讲稿与制作 | 原有计数文字和场景数值加标题；保留原 required 与数值约束 | 该导览的同名组件与场景 |
| 正文与富内容 | 按媒体 kind 公开有效显示字段；来源、字幕文件和备用图只读 | `PmMedia` 与 `domain/media.ts` |
| 联网资源 | 相同媒体字段，以及 YouTube 开始秒数、宽高和说明；视频标识只读 | `PmYoutube`／`PmMedia` |
| 课堂互动 | Quiz 选项与正确索引、预测问题与选项、反馈问题与选项、练习执行时限 | `PmQuiz`／`PmPredict`／`PmPulse`／`PmExercise` |
| 代码与运行 | 四个运行面板的正数执行时限 | `PmRunPanel`／`PmStepRun` 与真实超时配置读取 |
| 可选执行环境 | 运行面板的正数执行时限 | `PmRunPanel`；不公开环境路径或连接身份 |

媒体字段按实际效果声明：audio 不公开实现忽略的宽高／静音；animation 不公开实现忽略的播放控件／自动播放。Predict 的 `notes`／`reveal` 是子块 ID，声明为只读，未误作文字输入。Quiz 正确答案是从 0 开始的整数索引数组；普通 JSON Schema 不提供与另一数组长度联动的上限，本片没有伪造固定最大值，也不声称已经增加该语义校验。

没有增加 `default` 或关闭 `additionalProperties`；未知已有值继续保留。没有添加 State schema、修改状态或步骤覆盖：现有 `Definition.parameterSchema` 已校验组件基础参数与有效步骤参数的浅合并，未声明 State schema 的状态继续使用该约束。无作者参数的 Markmap 编码数据、光标路径、终端身份与无参数场景没有被猜测成通用可编辑字段。

## 实际验证

- 七份修改的 JSON 逐一与固定基线比较，恢复各改动的 `parameterSchema` 后，整份文稿语义完全相等。稳定 ID、组件引用、基础参数值、步骤覆盖、讲稿、production、资源与实现文件均未改动。
- 使用实际 `validateDocument` 校验全部 11 份顶层文稿：0 error、0 warning。这是纯规范校验，没有构建全部示例。
- 复制单份 `guide-steps` 及其真实组件、场景到私有临时工作区，以原版 `presmium check <该文稿> --json` 实际编译和检查：退出 0，0 error、0 warning、0 info。未运行其他导览构建、浏览器工作台、模型、套件或公共服务。
- 临时单文稿副本已删除，CLI 进程已终止；证据保留在本片工作树的 ignored `.presmium/component-properties-design/`。Figma 最终图为 `review-final.png`，校验为 `validation.json`，单文稿结果为 `guide-check.json`，schema 比对为 `schema-only-proof.json`。

设计图与 schema 通过不代表 Dialog 的焦点、草稿恢复、事务并发、素材引用或四组合浏览器流程已经验收；这些由各实现片的真实消费者单独记录。
