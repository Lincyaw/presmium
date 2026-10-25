---
title: Anime.js：原子动画合集
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
renderers:
  web: {}
---

(intro)=
# Anime.js：原子动画合集

Anime.js 以毫秒计时，自带 SVG 描线、变形、沿路径运动、文字拆分与网格错峰，适合把示意图、算法过程与公式一步一步画出来。下面每一节是一个可以直接照抄的场景。

(draw-curve)=
## 描出曲线：createDrawable

(draw-curve-scene)=
:::{scene} draw-curve
:durations: 1.0, 1.6, 1.8
坐标轴先画出，随后描出正弦曲线，最后一段高亮沿曲线滑过。
:::

先画两条坐标轴。

正弦曲线从左到右一笔描出来。

一段高亮的窗口沿着曲线滑过去，起点和终点都可以单独控制。

(draw-fill)=
## 先描边再填色：示意图的方框

(draw-fill-scene)=
:::{scene} draw-fill
:durations: 1.4, 1.2, 1.6
处理器五级流水线：五个方框依次描出边框，箭头连起来，再逐级填色。
:::

五级流水线的方框一个接一个描出边框，写上名字。

箭头把相邻的两级连起来。

每个时钟周期一条指令前进一级，方框按顺序填上颜色。

(graph-bfs)=
## 图上的高亮路径：广度优先搜索

(graph-bfs-scene)=
:::{scene} graph-bfs
:durations: 1.2, 1.2, 1.3, 1.0
从 A 出发的广度优先搜索，每一步展开一层，树边沿父到子的方向画出。
:::

图里有七个节点，搜索从 A 开始。

第一层：A 的邻居 B 和 C 被访问，两条树边亮起。

第二层：D、E、F 被访问。C 到 E 的边不是树边，E 已经由 B 找到。

最后一层只剩 G，搜索结束。

(packet-path)=
## 沿路径运动：createMotionPath

(packet-path-scene)=
:::{scene} packet-path
:durations: 0.6, 1.8, 1.8
一个请求从客户端经过两台路由器到达服务器，响应沿原路返回。
:::

客户端和服务器之间隔着两台路由器。

请求沿着路径走过去，在弯道处跟着转向。

响应 200 沿相反的方向回到客户端。

(taylor-morph)=
## 形状变形：morphTo 与泰勒展开

(taylor-morph-scene)=
:::{scene} taylor-morph
:durations: 0.8, 1.2, 1.2, 1.2
正弦函数的泰勒多项式逐阶变形，越来越贴近 sin x。
:::

虚线是 sin x，最简单的近似是 y = x，只在原点附近准确。

加上三次项，曲线在两侧弯了回来。

加上五次项，贴合的范围更宽。

到九次项，在整整一个周期里几乎看不出差别。

(token-split)=
## 逐词与逐字：splitText

(token-split-scene)=
:::{scene} token-split
:durations: 1.2, 1.2, 1.2
英文句子按词出现，中文句子按字出现，再把词元框出来。
:::

英文按词切分，每个词是一个词元，依次出现。

中文一个字一个字地出现。

把词元框出来：英文每个词一个框，中文的“注意力”三个字各自是一个词元。

(grid-ripple)=
## 网格错峰：stagger 的 grid、from 与 axis

(grid-ripple-scene)=
:::{scene} grid-ripple
:durations: 0.9, 1.5, 1.6
十五乘九的网格从中心长出，再从一个格子向外荡开波纹，最后逐行扫过。
:::

格子从中心向外长出来，延迟按到中心的距离算。

从第三行第四列的格子开始，波纹一圈一圈向外荡开。

只按行算距离，网格一行一行地扫过去，像卷积核滑过图像。

(bubble-swap)=
## 交换与排序：多段补间同一属性

(bubble-swap-scene)=
:::{scene} bubble-swap
:durations: 1.6, 1.4, 1.2, 0.8
冒泡排序：相邻两根柱子比较，前者大就交换；每一遍把最大的送到末尾。
:::

第一遍：相邻两根依次比较，大的往右换，9 到了最右边。

第二遍：8 到了倒数第二位。

第三遍：6 就位，这时整个数组其实已经有序。

剩下的柱子一起标为就位，排序完成。

(param-counter)=
## 数字滚动：模型参数量

(param-counter-scene)=
:::{scene} param-counter
:durations: 1.2, 1.2, 1.2
GPT、GPT-2、GPT-3 的参数量，数字滚动，柱子按对数刻度长高。
:::

GPT 有 1.17 亿个参数。

GPT-2 是 15 亿，多了一个数量级。

GPT-3 是 1750 亿，柱子按对数刻度才放得下。

(attention-heat)=
## CSS 变量驱动颜色：注意力矩阵

(attention-heat-scene)=
:::{scene} attention-heat
:durations: 1.6, 0.8
五个字两两之间的注意力权重，颜色深浅表示大小；加上因果掩码后，每个字只看它之前的字。
:::

每一格是一个字对另一个字的注意力权重，按行填满，对角线最深。

加上因果掩码：右上方变成零，每一行重新归一化。

(nn-sync)=
## 标签与子动画：神经网络前向传播

(nn-sync-scene)=
:::{scene} nn-sync
:durations: 0.6, 2.6, 0.6
一个四层的全连接网络，激活一层一层向前传播。
:::

一个小网络：三个输入，两个隐藏层，两个输出。

前向传播：输入先亮，权重把信号传到下一层，一层接一层。

输出里值较大的一个就是预测结果。

(descent-canvas)=
## 画布动画：梯度下降

(descent-canvas-scene)=
:::{scene} descent-canvas
:durations: 0.8, 2.6, 2.6
狭长山谷形的损失函数等高线上，普通梯度下降来回振荡，带动量的下降更平顺。
:::

损失函数的等高线是一组扁椭圆，最低点在中间。

普通梯度下降步子大，在陡的方向上来回振荡。

加上动量，同一个起点沿着山谷平顺地走到最低点。

(kmeans-seeded)=
## 可复现的随机：k 均值聚类

(kmeans-seeded-scene)=
:::{scene} kmeans-seeded
:durations: 1.4, 1.8, 2.0, 1.0
九十个点按种子随机生成，k 均值聚类迭代两轮。
:::

数据点按固定种子生成，每次打开都一样。

放下三个初始中心，每个点染上最近中心的颜色。

中心移到各自簇的平均位置，一些点换了颜色。

再迭代一轮，中心几乎不再移动，聚类收敛。

(easing-lanes)=
## 缓动函数一览

(easing-lanes-scene)=
:::{scene} easing-lanes
:durations: 1.8, 1.8
十种缓动函数并排比较：同样的距离、同样的时长，快慢分布不同。
:::

同一段距离、同样的时长，每一行用一种缓动跑过去。

再跑回来，不对称的缓动这时显出另一面。

(ball-keyframes)=
## 关键帧：弹跳的球

(ball-keyframes-scene)=
:::{scene} ball-keyframes
:durations: 2.4, 2.6
小球落下弹起，一次比一次低；再演一遍，落地时压扁、弹起时拉长。
:::

用百分比关键帧排出每次弹起的高度，一次比一次低。

再落一次，每次触地都压扁再拉长，看起来更有弹性。

(wave-loop)=
## 循环与往返：从振动到波

(wave-loop-scene)=
:::{scene} wave-loop
:durations: 2.5, 4.4
一个点上下振动，随后一排点依次加入，形成向右传播的波。
:::

一个点做简谐振动，上下往返三次。

其他点按距离依次延迟加入，同样的振动连成一列向右传播的波。

(binary-set)=
## 离散变化：二进制计数

(binary-set-scene)=
:::{scene} binary-set
:durations: 0.8, 3.0
四位二进制计数器从 0 数到 15，每一位翻转时变色。
:::

四个位，从高到低是 8、4、2、1。

从 0 数到 15，最低位每次都翻转，进位从右向左传。

(flip-cards)=
## 三维翻转：概念卡片

(flip-cards-scene)=
:::{scene} flip-cards
:durations: 1.0, 1.6
三张概念卡片发到桌面，再依次翻面显示解释。
:::

三张卡片，正面是术语。

依次翻过来，背面是一句话的解释。

(hash-scramble)=
## 乱码揭示：哈希的雪崩效应

(hash-scramble-scene)=
:::{scene} hash-scramble
:durations: 1.6, 0.6, 1.6
hello 的 SHA-256 摘要从乱码中显现；把最后一个字母改成 p，摘要完全变了。
:::

hello 的 SHA-256 摘要从左到右从乱码中显现出来。

把最后一个字母 o 改成 p，只差一个字母。

新的摘要每一位都可能变，看不出和原来的任何关系，这是雪崩效应。
