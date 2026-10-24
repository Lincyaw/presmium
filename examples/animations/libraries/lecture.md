---
title: 代码写成的动画
lang: zh-CN
plugins:
  - '@lincyaw/addon-core'
  - '@lincyaw/addon-motion'
  - '@lincyaw/addon-guide'
  - '@lincyaw/addon-lecture'
  - '@lincyaw/addon-speech'
renderers:
  web: {}
  slides: {}
  lecture:
    voice: { engine: edge, voice: zh-CN-XiaoxiaoNeural }
---

(intro)=
# 代码写成的动画

这份文稿演示用代码写的动画：GSAP、Anime.js、Motion、Three.js 与 Remotion 都跟着讲授的步骤和时间走，讲解、字幕、光标和点击编进同一条时间线，再一帧一帧导出成视频。

(gsap)=
## GSAP：字节对合并

(bpe)=
:::{scene} bpe-merge
:durations: 1.2, 1.2, 1.4, 1.6
low、lower、lowest 三个词的字节对合并：先合并 l 与 o，再合并 lo 与 w。
:::

字节对编码从单个字符开始：low、lower、lowest 三个词先拆成字母。

统计相邻的字节对，{cue}`pause 300ms` 出现最多的是 l 和 o，三个词里都有。

把它们合并成一个新符号 lo，{cue to=bpe}`spot` 词表里多了一项。

再数一遍，lo 和 w 最多，合并成 low。{say alias="B P E"}`BPE` 就这样一轮一轮地长出词表。

(anime)=
## Anime.js：编译管线

(pipeline)=
:::{scene} pipeline
:durations: 0.8, 1.2, 1.6, 0.8
MyST 源码编译为 IR，再由渲染端生成网页、幻灯片、notebook 与视频。
:::

讲义的源码是 MyST，一份文件。

编译器把它变成中间表示 IR，只记语义和算好的结果。

渲染端各取所需：网页、幻灯片、notebook，还有视频。

视频也从同一份讲义来，讲解就是它的脚本。

(motion)=
## Motion：注意力权重

(attention)=
:::{scene} attention
:durations: 1.0, 1.0, 0.6
句子 The cat sat on the mat 中，查询词 cat 与 mat 对各个词的注意力权重。
:::

查询词 cat 看向句子里的每个词，它自己的权重最大。

查询换成 mat，同一组柱子换上新的权重。

权重最大的是 mat 自己，{cue}`mark 注意力` 它亮了起来。

(three)=
## Three.js：词向量空间

(embedding)=
:::{scene} embedding
:durations: 1.5, 2.2, 1.6
三维空间中的词向量：散开的点聚成三团，镜头推近其中一团。
:::

词向量一开始散在空间里。

训练之后，意思相近的词聚成了三团。

镜头推近其中一团，{cue}`pause 400ms` 它们指向差不多的方向。

(remotion)=
## Remotion：片头

(title)=
:::{scene} title-card
:durations: 1.0, 1.6, 1.0
Remotion 写的片头：标题弹入，副标题逐字出现，最后升起一枚徽章。
:::

这一页是 Remotion 写的片头，标题弹了进来。

副标题一个字一个字地打出来。

画面由帧号决定，所以导出视频时每一帧都确定。

(click)=
## 讲到哪里点哪里

(counter)=
:::{component} MergeCounter
:::

这是文稿自己写的组件，“合并一次”是它的具名动作。

:::{cursor}
:reveal:
#merge-once
click #merge-once
:::

光标移到按钮上。

讲到这里 {cue to=counter}`click merge` 点一次，词表多了 lo；{cue}`pause 500ms` 再点 {cue to=counter}`click merge` 一次，又多了 low。

(video)=
## 从讲义到视频

```bash
presmium build --to web,lecture
presmium-lecture export . --burn zh-CN
```

讲解经语音合成成为讲授轨，字幕、章节和每个提示都在时间线上。导出时一帧一帧推进时间，动画、光标与点击都按讲授的时刻画出来。
