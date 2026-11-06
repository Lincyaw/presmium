# 发布标题

故意让草稿模型被拒绝，长程智能体反而更准？｜Adversarial Speculative Reasoning

## 正文文案

推测解码通常被当成纯加速技术：草稿模型先提出词元，目标模型做精确验证，输出分布保持不变。但论文发现，在低精度服务里，验证块越往后，数值噪声越大。长程智能体一旦把关键决策写进噪声更大的验证槽位，这个误差会跟着 KV 缓存进入之后几十轮推理。

《Adversarial Speculative Reasoning》把草稿模型反过来训练：在决策点，草稿主动提出应被拒绝的判断。目标模型因此重新采样，把关键决策的首个词元写到新验证块的槽位 0，也是数值精度最高的位置。目标模型和验证规则没有改变，给定 KV 上下文时输出分布也不变；改变的是关键词元写入缓存时获得的 context precision。

在 DeepSWE 上，GLM-5.3 的通过率从 60.6% 升到 67.6%，DeepSeek-V4.1-Flash 从 67.8% 升到 71.8%。在 NL2Repo-Bench 上，两者分别提升 5.8 和 1.4 个百分点。两个目标模型只需训练整套系统约 0.06% 到 0.28% 的草稿模型参数。

这期用动画讲清验证块内的精度递减、拒绝为什么能把关键决策送回槽位 0，以及为什么收益只来自对抗方向。想看哪篇论文，欢迎在评论区留言。

翰林院传达室 · 三分钟读完一篇论文

话题：#大模型 #推测解码 #智能体 #长程推理 #论文解读

## 发布素材

- 封面：[cover.png](cover.png)
- 视频：[adversarial-speculative-reasoning.mp4](dist/adversarial-speculative-reasoning.mp4)
- 字幕：[adversarial-speculative-reasoning.zh-CN.vtt](dist/adversarial-speculative-reasoning.zh-CN.vtt)
- 论文：Adversarial Speculative Reasoning Improves Long Horizon Agents，arXiv 2611.05345

视频由 `lecture.json` 与已提交的配音缓存导出。
