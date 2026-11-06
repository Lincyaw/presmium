# 发布标题

故意让草稿模型被拒绝，长程智能体反而更准？｜Adversarial Speculative Reasoning

## 正文文案

speculative decoding（推测解码）通常被当成纯加速技术：draft model 提出 token，target model 做 exact verification（精确验证），output distribution 保持不变。但论文发现，在低精度服务里，verification block 越往后，数值噪声越大。long-horizon agent 一旦把关键决策写进噪声更大的 verification slot，这个误差会跟着 KV cache 进入之后几十轮推理。

《Adversarial Speculative Reasoning》把 draft model 反过来训练：在 decision point（决策点），草稿主动提出应被拒绝的判断。target model 因此重新采样，把关键决策的首个 token 写到新 verification block 的 slot 0，也是数值精度最高的位置。target model 和 verification rule 没有改变，给定 KV context 时 output distribution 也不变；改变的是关键 token 写入缓存时获得多少 context precision。

在 DeepSWE 上，GLM-5.3 的通过率从 60.6% 升到 67.6%，DeepSeek-V4.1-Flash 从 67.8% 升到 71.8%。在 NL2Repo-Bench 上，两者分别提升 5.8 和 1.4 个百分点。两个 target model 只需训练整套系统约 0.06% 到 0.28% 的 draft 参数。

这期用动画讲清 verification block 内的精度递减、拒绝为什么能把关键决策送回 slot 0，以及为什么收益只来自 adversarial direction。想看哪篇论文，欢迎在评论区留言。

翰林院传达室 · 三分钟读完一篇论文

话题：#大模型 #speculative-decoding #智能体 #长程推理 #论文解读

## 发布素材

- 封面：[cover.png](cover.png)
- 视频：[adversarial-speculative-reasoning.mp4](dist/adversarial-speculative-reasoning.mp4)
- 字幕：[adversarial-speculative-reasoning.zh-CN.vtt](dist/adversarial-speculative-reasoning.zh-CN.vtt)
- 论文：Adversarial Speculative Reasoning Improves Long Horizon Agents，arXiv 2611.05345

视频由 `lecture.json` 与已提交的配音缓存导出。
