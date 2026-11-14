# 论文分享第三期：SFT训练数据

## 简介

今天分享新加坡国立大学、耶鲁大学与 Cisco Foundation AI 团队的论文 Rethinking “RL Generalizes, SFT Memorizes”: The Role of SFT Data。

这项研究重新比较监督微调与强化学习的泛化能力。作者发现，数据来源与训练轨迹数量会明显影响结果：在所测的千问模型中，适当混合解答来源并匹配训练轨迹总量后，监督微调能够接近强化学习，部分配置的均值略高。进一步分析表明，扩大训练集能覆盖更多少见解法，为领域外推理提供迁移信号。

#文献阅读 #研究生论文 #文献 #带你一起读论文 #大模型 #论文写作

## 发布素材

- [独立封面](cover.png)
- [配音动画](dist/lecture.mp4)
- [字幕](dist/lecture.zh-CN.vtt)
- [视频联系表](dist/lecture.contact-sheet.png)
- [完整讲稿](dist/script.md)
- [原论文](https://arxiv.org/abs/2611.14912)

## 发布记录

- 论文标识：arxiv:2611.14912
- 原文版本：v1，2026-11-11
- 账号：翰林院传达室；小红书账号5164643939
- 期数：3
- 状态：已发布
- 期数依据：2026-11-14（Asia/Shanghai）制作时与上传前两次核对笔记管理，搜索“论文分享”均共2篇，第一期和第二期。
- 成片：lecture.mp4；13,083,541字节；1920×1080，30fps，H.264/AAC，312.70秒。
- 成片SHA-256：6156e17899a50a6defe6833133a24d7e22fd5259faedf73fa7b716dee8293142
- 封面：cover.png；113,083字节；1200×900。
- 封面SHA-256：e2af8eb3e1618957b60068e8e96ef990028fef56525a61c3fb7e427b51d93a8a
- 成片验收：完整音视频解码通过；-40dB、0.8秒阈值未发现长静音；首帧完整且不含字幕；正文字幕、关键结果帧、32格最终联系表及逐步讲稿冷读通过。
- 笔记：https://www.xiaohongshu.com/explore/6af7c645000000002203ae17
- 笔记ID：6af7c645000000002203ae17（笔记管理该卡片的noteId）
- 提交时间：2026-11-14 10:24（Asia/Shanghai）
- 最近核实：2026-11-14 10:26（Asia/Shanghai）；已发布列表搜索第三期共1篇，封面和05:12时长一致。
- 平台内容类型声明：笔记含AI合成内容；公开可见，即时发布；PK封面、原创声明与定时发布均未启用。
- 回执：[已发布记录截图](dist/xiaohongshu-published.jpg)

## 改版预览（未替换线上笔记）

- [完整配音预览](dist/lecture-v2-preview.mp4)
- [核心动画预览：数量匹配与原图比较](dist/core-motion-preview.mp4)
- [预览字幕](dist/lecture-v2-preview.zh-CN.vtt)
- [实际成片联系表](dist/lecture-v2-preview.contact-sheet.png)
- [转场边界检查](dist/v2-boundary-sheet.jpg)
- 生成时间：2026-11-14（Asia/Shanghai）；原生MCP任务mwfuvgiu70f02118完成。
- 文稿版本bd628acb13844f6e65de，内容指纹04e1719bde5ee414，渲染输入指纹be20066d56fad02f。
- 预览：18,010,830字节，1920×1080、30fps、H.264/AAC、48kHz立体声、312.70秒，9381帧完整解码通过。
- SHA-256：2cf3a58cd2819e171081321ee039fab31e59e720c53b35365c9b21853010cfdb。
- 复用16段配音缓存，未新增合成用量；-40dB、0.8秒阈值未检出长静音。实际首帧无字幕，正文字幕、关键结果和全部相邻状态边界已做帧采样检查。
- 解析动画按分镜重建，元素/操作设计与独立冷读见storyboard.md K–N。定时帧与导出帧不能代替连续观看；完整音画观感和与第一期的风格契合仍待作者看预览，不标成整体验收通过。
- 线上原笔记和期数不变；dist/lecture.mp4保持原已发布文件及原SHA-256。改版不占新期数，未重新上传。
