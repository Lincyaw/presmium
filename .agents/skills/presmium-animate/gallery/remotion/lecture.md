---
title: Remotion：原子动画合集
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
renderers:
  web: {}
---

(intro)=
# Remotion：原子动画合集

Remotion 把画面写成“帧号的函数”：一个 React 组件读 `useCurrentFrame()`，用 `interpolate`、`spring` 算出样式。它适合排版很重的动画：文字、数字、图表、字幕、面板的进出。下面每一节是一个能直接抄的场景，画面完全由时刻决定，前后拖动都一样。

(sequence-steps)=
## 一步一个 Sequence

(sequence-steps-scene)=
:::{scene} sequence-steps
:durations: 1.0, 1.0, 1.0
三张卡片“分词”“嵌入”“注意力”依次弹出，箭头连起它们，每张卡片显示自己的局部帧。
:::

第一步是一个从 at(0) 开始的 Sequence，卡片里的帧从 0 数起。

第二步的 Sequence 从 at(1) 开始，新卡片的局部帧也从 0 数起，前一张卡片留在原处。

第三步同样如此。不给 durationInFrames，前面的步骤就一直留在画面上。

(spring-pop)=
## 弹簧：spring()

(spring-pop-scene)=
:::{scene} spring-pop
:durations: 1.0, 1.6
标题 spring() 弹出；四个小球用不同的弹簧参数冲向同一条终点线。
:::

标题按弹簧弹出，稍微冲过头再回到原大小。

四个小球同时出发：默认参数会冲过终点再回来，damping 200 平稳停下，overshootClamping 到线就停，mass 3 起步更慢。

(typewriter)=
## 打字机与光标

(typewriter-scene)=
:::{scene} typewriter
:durations: 1.4, 2.2
代码框中逐字打出 softmax 函数的三行代码，光标跟在末尾。
:::

第一行逐字打出，打字时光标常亮，停下后闪烁。

接着打出后两行：减去最大值再取指数，最后归一化。

(word-highlight)=
## 逐词高亮

(word-highlight-scene)=
:::{scene} word-highlight
:durations: 2.4, 1.0
一句话中的词依次画上底色，随后关键短语变成强调色，其余变淡。
:::

荧光笔从左到右逐词划过这句话。

关键短语“下降最快的方向”变成强调色，其余的词退到背景。

(counter)=
## 数字滚动

(counter-scene)=
:::{scene} counter
:durations: 1.2, 1.2, 1.4
大号数字从零滚到 GPT-1 的参数量，再滚到 GPT-2、GPT-3，下方的对数刻度条随之变长。
:::

GPT-1 有一亿多个参数。

GPT-2 是十五亿，十几倍。

GPT-3 是一千七百五十亿，又大了一百多倍，对数刻度条走到头。

(bar-chart)=
## 柱状图：错开的弹簧

(bar-chart-scene)=
:::{scene} bar-chart
:durations: 1.2, 1.2
五个词的 softmax 概率柱依次长出；温度从 1 降到 0.4 后，最高的柱更高，其余变矮。
:::

温度为 1 时的概率分布，柱子一根接一根长出来。

把温度降到 0.4，分布变尖：the 的概率大了，其他词都变小。

(path-draw)=
## 画出路径

(path-draw-scene)=
:::{scene} path-draw
:durations: 1.6, 2.0
先画出坐标轴和一条曲线，再有一个点沿曲线移动，带着它的切线和斜率。
:::

坐标轴先出现，曲线从左往右画出来。

一个点沿着曲线走，切线跟着它转，斜率的数值随之变化。

(swap)=
## 比较与交换

(swap-scene)=
:::{scene} swap
:durations: 0.8, 1.0, 0.6
冒泡排序的一次比较与交换：前两个数 5 和 3 被标亮，沿弧线交换位置，然后变成绿色。
:::

比较前两个数，5 比 3 大，它们被标亮。

两个数沿着弧线交换位置，一个从上面过，一个从下面过。

交换完成，这一对变成绿色，5 向右冒了一格。

(series-transition)=
## 面板切换：Series 与重叠

(series-transition-scene)=
:::{scene} series-transition
:durations: 1.0, 1.0, 1.0
三张面板“前向传播”“计算损失”“反向传播”依次从右侧滑入，前一张向左滑出。
:::

第一张面板从右侧滑入：前向传播得到预测值。

第二张面板推开第一张：计算损失。

第三张面板进来：反向传播，更新参数。

(wipe)=
## 擦除转场

(wipe-scene)=
:::{scene} wipe
:durations: 0.6, 1.2
“排序前”的柱子被一道竖线从左向右擦成“排序后”的柱子。
:::

先看排序前的数组。

一条亮线从左往右扫过，扫过的地方换成排序后的样子。

(lower-third)=
## 下方字幕条

(lower-third-scene)=
:::{scene} lower-third
:durations: 1.2, 1.0, 0.8
画面左下角出现人名字幕条“Ada Lovelace，第一位程序员”，随后加一行注释，最后整条退出。
:::

字幕条的竖线先长出，底板展开，名字和头衔从遮罩下面升上来。

再升起一行注释：她为分析机写的伯努利数程序。

字幕条向左退出，用的是反向的弹簧。

(kinetic-type)=
## 动态文字

(kinetic-type-scene)=
:::{scene} kinetic-type
:durations: 1.4, 1.0
“Attention is all you need”逐词弹入，随后 all 放大变色，其余的词缩小变淡。
:::

五个词一个接一个弹进来，带一点旋转。

all 这个词猛地放大再回落，成为画面的焦点。

(monte-carlo)=
## 带种子的随机：蒙特卡洛估计 π

(monte-carlo-scene)=
:::{scene} monte-carlo
:durations: 3.0, 0.8
单位正方形中撒下 600 个随机点，落在四分之一圆内的点着色，右侧实时显示 π 的估计值，最后描出圆弧。
:::

随机点一个个落下，圆内的点着强调色，右边的估计值越来越接近 π。

描出四分之一圆弧：圆内点占的比例乘以 4，就是 π 的估计。

(easing)=
## 缓动函数一览

(easing-scene)=
:::{scene} easing
:durations: 1.4, 1.6
七行小球用七种缓动函数从左跑到右，每行左边画出缓动曲线。
:::

前四行：匀速、两头慢、先快后慢、自定义贝塞尔曲线。

后三行：back 和 elastic 冲过终点再回来，bounce 在终点弹跳。

(spring-chain)=
## 用 measureSpring 串联

(spring-chain-scene)=
:::{scene} spring-chain
:durations: 2.6, 0.8
五级流水线的方块依次落下，每一块在前一块停稳的那一帧开始。
:::

取指、译码、执行、访存、写回依次落下，前一块停稳下一块才开始。

measureSpring 给出一次弹簧要多少帧，五级加起来就是总时长。

(beam-prune)=
## 反向弹簧：退出

(beam-prune-scene)=
:::{scene} beam-prune
:durations: 1.0, 1.2
束搜索的五个候选词弹入；束宽为 2，概率低的三个反向弹出，留下的两个靠拢。
:::

五个候选词带着概率弹进来。

束宽是 2：后三个按反向的弹簧退出，猫和狗留下来。

(freeze)=
## 定格：Freeze

(freeze-scene)=
:::{scene} freeze
:durations: 1.6, 1.0
一个抛体沿抛物线飞过；随后画面定格在最高点，画出水平速度的箭头。
:::

小球斜抛出去，虚线是它的轨迹。

画面定格在最高点：竖直速度为零，只剩水平速度。

(loop-pulse)=
## 循环：Loop

(loop-pulse-scene)=
:::{scene} loop-pulse
:durations: 0.6, 2.4
客户端与服务器之间，请求和响应的小方块来回往返，服务器周围一圈圈脉冲。
:::

客户端和服务器之间连着一条线路。

请求一次次发往服务器，响应一次次返回，服务器上的光圈不断扩散。

(wobble)=
## 正弦抖动：晶格振动

(wobble-scene)=
:::{scene} wobble
:durations: 1.2, 1.6
一张原子晶格在原位轻微振动；温度升高后振幅变大，原子变成红色。
:::

室温下，原子在格点附近轻轻抖动。

温度升到 800 K，振幅变大，颜色变暖。

(posterize)=
## 定格动画：posterize

(posterize-scene)=
:::{scene} posterize
:durations: 2.4, 3.2
两个小球同时落下弹跳，左边逐帧平滑，右边每五帧才动一次；之后一个时钟的指针每秒跳一格。
:::

同样的弹跳，左边每帧都动，右边每五帧才更新一次，像定格动画。

时钟的指针每秒跳一格，用的也是 posterize。
