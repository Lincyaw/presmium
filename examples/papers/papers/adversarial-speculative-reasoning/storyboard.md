# 分镜：对抗式推测推理（Adversarial Speculative Reasoning Improves Long Horizon Agents，arXiv 2611.05345）

每个参与制作的 agent 先读完整文件，再读 `presmium-animate` 的 `SKILL.md`、`story.md`、`lengths.md`、`libraries.md` 和 `presmium-author` 的 `writing.md`。只改分配给自己的一页场景文件；`lecture.json`、本文件、共享 `paper.ts` 与数据由协调者维护。

## A. 简报

- **类型**：论文发布会式讲解，三到六分钟，主要形式是配音视频，同时是网页和幻灯片。
- **观众**：做大模型推理、评测或智能体系统的人，知道 token、上下文和 KV 缓存，不要求读过推测解码。
- **看之前**：speculative decoding 只提高速度；exact verification 保持 target distribution，因此 draft model 不会改变推理结果。
- **看之后**能复述：
  1. 问题：verification block 理论上保持 target distribution，实际低精度服务中却存在随 verification slot 增长的数值噪声；
  2. 为什么重要：长程智能体的关键决策会进入 KV 缓存，并被之后几十轮持续读回；
  3. 办法：找到 committing sentence，构造 preference pair，反向训练 draft model 在 decision point 提出应被拒绝的判断；
  4. 结果：拒绝让关键决策从新 verification block 的 slot 0 重写，两个前沿模型在两个编程基准上通过率提高；
  5. 机制：output distribution 不变，draft model 只决定关键决策落在哪个 verification slot。
- **用户要求**：参考 hinted-scaling-laws 的完整规格，不能压缩成只剩结论；保留发布会节奏，不做逐条教程。

## B. 论点

看完后，观众明白 speculative decoding 不只决定生成速度，也决定关键推理写进上下文的 context precision；在 decision point 故意让 draft model 被拒绝，就能把判断重新放到最精确的 verification slot，提升 long-horizon agent 通过率。

ABT：speculative decoding 用 draft model 加速 target model，而且 exact verification 保持 target distribution；但是 verification block 越往后数值噪声越大；所以反向训练 draft model 在 decision point 被拒绝，让 target model 从新的 slot 0 重写判断。

## C. 中心画面

全片固定一条 8 槽验证块。槽位 0 是已提交 token，最精确；槽位 1 到 7 是草稿 token，越往后越粗糙。同一个对象在问题页、方法页和结论页出现：

- 问题页：决策落在槽位 5，块内噪声随槽位上升。
- 方法页：草稿在槽位 5 提出应拒绝的判断，目标模型拒绝并从残差分布采样。
- 结论页：新 verification block 从 slot 0 写入关键决策；普通 token 保持高 draft acceptance rate。

颜色和位置不变。大模型、关键决策、训练偏好和结果数值全部来自 `scenes/data/asr.json`。

## D. 名称、颜色与空间

| 概念 | 全片用词 | 不用 |
|---|---|---|
| speculative decoding | 首次写 `speculative decoding（推测解码）`，后续直接复用原词 | 只写推测解码后当作已定义 |
| draft model / target model | 首次双语，后续复用 `draft model` / `target model` | 小模型 / 主模型 |
| verification block | 首次写 `verification block（验证块）`，后续复用原词 | 验证窗口 |
| verification slot / slot | 首次写 `verification slot（验证槽位）`，图上用 `slot 0–7` | 位置、卡槽 |
| exact verification | 首次写 `exact verification（精确验证）` | 无损验证（单独使用） |
| KV cache | KV 缓存 | 键值存储 |
| committing sentence | 首次双语为 `committing sentence（决策句）`，后续复用原词 | 提交句、承诺句 |
| decision frame | 首次双语为 `decision frame（决策框架）`，后续复用原词 | 决策理由、判断口径 |
| fork pair | 首次双语为 `fork pair（同源分叉对）` | 普通对比样本 |
| preference pair | 首次双语为 `preference pair（偏好对）`，说明由 fork pair 产生 | 正负样本、对比样本 |
| direct preference optimization | 直接偏好优化（DPO） | 偏好蒸馏 |
| adversarial draft | 首次双语后复用原词 | 坏草稿、反向模型 |
| context precision | 首次写 `context precision（上下文精度）`，后续复用原词 | 上下文准确率 |
| decision point | 首次写 `decision point（决策点）`，后续复用原词 | 判断节点、分叉点 |
| accepted length | 首次写 `accepted length（接受长度）`，后续复用原词 | 接受 token 数、验证长度 |
| long-horizon agent | 长程智能体 | 长期 agent |

| 颜色 | 含义 |
|---|---|
| 蓝 `--c-target` | 目标模型、精确路径 |
| 橙 `--c-draft` | 草稿模型、草稿提案 |
| 蓝→橙 `--c-precise` → `--c-noisy` | 槽位 0 到 7 的精度递减 |
| 红 `--c-reject` | 拒绝、错误方向 |
| 绿 `--c-accept` | 通过率提升、对抗偏好正结果 |
| 灰 `--c-baseline` | 无偏草稿、无关偏好 |

空间约定：左为输入和决策点，右为验证与结果；验证块始终 0 在左、7 在右。

## E. 共同规则

1. 一步一个意思；结束画面必须在 3 秒内读清。
2. 一次只移动一个主要对象；因先于果，同一对象移动或变形，不淡化后复制。
3. 画面只放关键词、数字、图例和坐标轴；完整解释放进讲稿。
4. 术语第一次出现时定义；不提前使用后面页面的名称。
5. 只用补间与 `set`；节拍用 `clock(at, durations)` 的 `T(k, f)`，不用回调、CSS 动画或外部计时器。
6. 颜色只来自设计令牌和 `paper.ts`；尺寸只来自 `TYPE` 与容器单位。
7. 图内文字保留论文英文；我们的解释放在图外。
8. 数字只从 `scenes/data/asr.json` 读取，不在场景里手写。
9. 原图是 `<img>` 导入，不用 CSS 背景图或运行时的相对 URL。
10. 每个页面独立检查亮色、暗色、任意步骤跳转与 390px 阅读宽度。

## F. 定义

| 术语 | 首次出现 | 定义 |
|---|---|---|
| KV 缓存 | problem 0 | 已生成 token 在推理时留下的键值表示，后续推理会持续读回 |
| speculative decoding | problem 1 | draft model 提出一段 token，target model 一次验证 |
| verification block | problem 1 | 一次提交给 target model 验证的 8 个位置 |
| verification slot | problem 1 | block 中的位置，0 最精确，7 最粗糙 |
| context precision | problem 2 | token 写入 KV cache 时的数值可靠性 |
| decision point | method 0 | 推理中选择下一步行为的位置 |
| committing sentence | training 0 | 推理中确认观察、说明下一步或正式落下决定的句子 |
| fork pair | training 1 | 共享 decision point 之前全部 token 的两条续写 |
| preference pair | training 1 | fork pair 中 preferred side 与 adversarial side 组成的一对续写 |
| DPO | training 2 | 用 preference pair 训练模型提高 chosen 相对 rejected 概率 |
| adversarial draft | method 1 | 在 decision point 偏好 adversarial side、主动触发拒绝的 draft model |
| accepted length | evidence 3 | 每次 verification step 平均 accepted draft token 数 |

## G. 页面与步骤

| 页 | 步 | 结束画面 | 讲稿要点 |
|---|---|---|---|
| opening | 0 | 品牌卡与论文信息 | 固定开场白 |
| problem | 0 | 90 轮智能体轨迹，多个决策被写回 KV 缓存；右侧关键词“需求理解 / 是否验证 / 何时提交” | 长程判断会持续读回 |
| | 1 | 8 槽验证块；槽位 0 为已提交 token，1 到 7 为草稿 token；标“采样分布 = 目标模型” | 推测解码定义与精确验证 |
| | 2 | 论文图 1；右侧显示槽位 0→7 相对噪声 +34%、>2 nats token 3.2%→6.2% | 分布精确不等于精度均匀 |
| | 3 | 论文图 2；右侧列出 31–50 轮 ×1.09、51–70 轮 ×1.16、独立复跑 ×1.20 | verify-written 与 decode-written context 的极端偏差跨轮差异 |
| method | 0 | ordinary draft 连续接受，decision point 的首 token 落在 slot 5；标 slot 0 最精确、slot 7 最粗糙 | 决策落点靠接受前缀的长度 |
| | 1 | 同一验证块，草稿在决策处提出 “Likely”；红叉表示目标模型拒绝，标注残差采样 | 拒绝是精度控制通道 |
| | 2 | 旧块淡化，新块从槽位 0 写入 “The spec says principle”；右侧显示分布不变、普通 token 照常加速 | 拒绝重启验证并移到最精确槽位 |
| training | 0 | 推理轨迹逐句出现，决策句被框出，顶部有“目标模型担任评审” | 从轨迹定位决策句 |
| | 1 | 同一前缀分叉成 preferred side 与 adversarial side，下方标 fork pair / preference pair | 从同一前缀构造 fork pair 与 preference pair |
| | 2 | 目标模型冻结，草稿模型反向训练；底部显示 DPO 与 2.15B / 449M 可训练参数 | 反向偏好训练草稿 |
| evidence | 0 | 论文图 4；右侧突显 held-out preference accuracy：decision frame 0.635、run tests 0.85、decision correctness 接近 0.5 | 草稿学得会决策表述与行为方向 |
| | 1 | DeepSWE 结果：GLM-5.3 60.6→67.6；DeepSeek-V4.1-Flash 67.8→71.8 | 主结果提升 |
| | 2 | NL2Repo-Bench 结果：GLM-5.3 +5.8；DeepSeek-V4.1-Flash 65.0→66.4（+1.4） | 第二个基准仍提升 |
| | 3 | accepted length：2.28→2.28；2.50→2.46，约 −1.6%，标“论文概括 ≤2%” | 精度重分配几乎不损解码吞吐 |
| controls | 0 | 两条从 preferred direction 经 unbiased draft 到 adversarial direction 的斜率图，方向相反 | preferred direction 训练反而更差 |
| | 1 | DeepSeek-V4.1-Flash 的无关偏好与通过率点图，合并 67.5% 对 67.8% | 无关偏好没有收益 |
| | 2 | 因果链“decision point→拒绝→关键决策首 token 落 slot 0”，下方对比接受与拒绝后的编码路径 | 提升来自关键决策的位置 |
| close | 0 | 目标模型冻结、草稿只训练 0.06–0.28%；关键决策位于槽位 0；结论句“上下文精度的分配器” | 同一模型重排精度 |
| | 1 | accepted length 至多下降约 2%；两个约 750B 模型、长程编程任务；最后回到结论 | 结果与代价 |
| ending | 0 | 结尾卡“让关键决策落在最精确 verification slot” | 固定结尾 |

## H. 数字来源

论文没有链接公开结果仓库。`scenes/data/derive.py` 记录正文与图 1、图 2、图 4、图 5、图 6、图 7 的数值，检查差值、参数比例和接受长度变化，生成 `scenes/data/asr.json`。

- 精度：GLM-5.3 平均噪声斜率 +0.0195 nats/槽，槽位 0→7 相对噪声约 +34%；DeepSeek-V4.1-Flash +0.0094 nats/槽；两者约 4%/槽。槽位 0 与单 token 解码 0.473 对 0.478 nats。
- 长程：>4 nats 偏差比在 31–50 轮为 1.09、51–70 轮为 1.16；独立复跑超过 30 轮为 1.20，论文读作 10–20% 的极端偏差增加。
- 偏好：run tests 的 adversarial direction 为 0.85，decision frame 的 adversarial direction 为 0.635；decision correctness 中位数 0.52/0.46，接近随机。
- DeepSWE：GLM-5.3 60.6→67.6（+7.0，95% CI 2.6–11.4）；DeepSeek-V4.1-Flash 正文 67.8→71.8（+4.0，CI −1.3–7.3）。
- NL2Repo-Bench：GLM-5.3 49.1→55.0，论文标 +5.8；DeepSeek-V4.1-Flash 65.0→66.4（+1.4，95% CI 0.4–2.4，p=0.011）。
- 对照：同一偏好翻转后 GLM-5.3 60.6→55.7（−4.9），DeepSeek-V4.1-Flash 67.8→66.4（−1.4）；无关偏好 27 次合并 67.5%，对 67.8%，Welch p=0.83。
- 参数：2.15B / (753B + 2.46B) = 0.28%；0.449B / (749B + 14.2B) = 0.06%。
- 解码吞吐代理：accepted length 2.28→2.28 与 2.50→2.46；后者下降 1.6%，论文概括为至多约 2%。

图 5 的 DeepSeek-V4.1 DeepSWE 均值标为 67.9/71.9，正文写 67.8/71.8；NL2Repo 的 +5.8 与显示值直接相减的 5.9 不同。视频采用正文与图内标注，差异留在 `derive.py` 和数据文件中，不另设来源页。

## I. 文件与流程

| owner | 文件 |
|---|---|
| 协调者 | `lecture.json`、`storyboard.md`、`scenes/paper.ts`、`scenes/data/*`、最终集成 |
| problem agent | `scenes/problem.ts` |
| method agent | `scenes/method.ts` |
| training agent | `scenes/training.ts` |
| evidence agent | `scenes/evidence.ts` |
| controls agent | `scenes/controls.ts` |
| close agent | `scenes/close.ts` |

每个 agent 只改自己的场景文件。需要共享数据或坐标时报告给协调者。完成后报告每一步结束画面、检查结果、发现的共享问题和未完成项。协调者统一编译、截帧、亮暗色与手机阅读检查，再做冷读。

## J. 评审记录

### 第 1 轮（2026-11-06，冷读 agent）

主论点可复述，但发现两个 P0：验证块没有明确槽位 0 是已提交锚点、其余 7 个是草稿；拒绝后没有清楚说明已接受前缀保留、拒绝 token 及其后缀丢弃、重采样 token 成为新块槽位 0。另有原始图字号偏小、参数占比缺少分母、接受长度被写成墙钟速度等问题。

处理：

- 问题页标题改为“8 槽位 = 1 个已提交锚点 + 7 个草稿”。
- 方法页保留旧块作为原因轨迹，并在新块槽位 0 标“目标重采样”；讲稿明确旧后缀丢弃。
- 证据页速度标题改为“接受长度基本不变”，补上 DeepSWE 与 NL2Repo 的置信区间。
- 训练页把可训练参数与目标模型、草稿模型组成的系统总参数并列。
- 结尾适用范围补“决策点不稳需重新验证”（第 5 轮按作者要求删除）。
- 讲稿加入 nats 定义和极端偏差事件率口径。

### 第 2 轮（2026-11-06，新冷读 agent）

确认 8 页、21 个讲解步骤的主线完整，槽位语义、新旧验证块转换、接受长度口径和来源入口已经可理解。剩余问题集中在 nats 的单位直觉、极端偏差倍数的表述、参数占比分母，以及少量原图字号，不再有阻断主线的状态转换歧义。

处理：

- problem 2 的讲稿解释 nats 与 1 nat 的概率意义。
- problem 3 的画面与讲稿统一为“极端偏差事件率比”，并说明 verify-written context 的事件率比 decode-written context 高一到两成。
- training 2 同时显示可训练参数、系统参数与占比。
- evidence 1、2 的来源行加入置信区间和 p 值。
- method 2 增加“已接受前缀保留”“目标重采样”“旧后缀丢弃”的状态说明。
- 开场与结尾改用较短的英文题名，避免右侧裁切。

### 第 3 轮（2026-11-06，术语审计与冷读）

观众能复述问题、方法、结果和 fork pair，但发现三个 P0：`1 nat` 被误写成概率相差 2.7 倍；关键决策被说成整句位于 slot 0，未区分首个 token；`output distribution` 不变与 KV 写入噪声看起来矛盾。另有 `preferred direction` 被误译成“正确一侧”、`decision correctness` 被误译成“答案正确性”、论文的 `fork pair` 被泛化成普通 `preference pair`。

处理：

- 把 `1 nat` 改为两个概率的比值约为 2.7。
- 统一说明 target 重采样的首个 token 成为新 block 的 slot 0，committing sentence 从该位置开始。
- 把 exactness 限定为给定 KV context 时 output distribution 不变，context precision 描述写入 KV cache 时的数值精度。
- 统一 `preferred direction`、`adversarial direction`、`unbiased draft`、`decision correctness` 与 `fork pair` 的原词和中文含义。
- 标题、正文、可访问性说明和场景标签统一从 `TERMS` 与 `PREFERENCE_LABEL` 读取。

### 第 4 轮（2026-11-06，结构审查）

逐页核对连接对象在静止帧中的端点，并检查亮色、暗色和回退步骤：

- `problem` 的 KV 回读箭头改为从缓存轨道右端内部出发，箭头尖部落在判断栏左边界。
- `method` 的拒绝掉头线从旧 block 的 decision point 出发，沿标题上方绕行，箭头落到新 block 的 slot 0；不再穿过或贴住标题。
- `training` 的两条 fork line 端点下移到分支框顶边，描边与边界相接。
- `controls` 的两条数据折线经过各自三个端点；三段因果链的箭头位于节点之间的固定轨道。
- 直接进入与向后返回到关键步骤的截图 SSIM 均为 1.0。
- 结构截图暴露 viewer app 主入口漏掉 `@lincyaw/host/design.css`，导致设计令牌全部缺失；主入口现显式引入该样式，并在隔离缓存中重新构建验证。

### 第 5 轮（2026-11-06，发布会精简）

作者明确要求发布会稿不放 defense 和“来源与说明”。

- 删除独立的来源页，保留论文图注、图内来源行和可复现数据文件作为依据。
- 删除结论页的“适用范围 / 换目标或领域需重新验证”提示和对应旁白。
- 结论页只保留模型规模、任务、参数占比、accepted length 代价与一句话结论。

### 第 6 轮（2026-11-06，配音与成片）

- 火山引擎甜美桃子生成 21 句、2515 字配音，缓存 3.5 MB；文稿检查为 0 error、0 warning。
- 实际视频 5:48，21 个讲解步骤，低于 6 分钟上限。
- 结论页第二步由 12 秒缩到 7 秒，最长段间静默从 7.2 秒降到 2.2 秒；旁白不需要重新生成。
- 导出 1920×1080、30fps、H.264/AAC MP4，烧入 88 条中文字幕；字幕无重叠、无越界。
- `contact sheet` 在 FFmpeg 7 下原先只取到 42 帧中的 36 帧；导出器改用扁平帧选择与 `-fps_mode passthrough` 后，42 帧完整写出。
