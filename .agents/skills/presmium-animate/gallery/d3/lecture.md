---
title: D3：原子动画合集
lang: zh-CN
plugins:
  - '@lincyaw/addon-motion'
renderers:
  web: {}
---

(intro)=
# D3：原子动画合集

D3 不是动画库，它把数据变成形状：比例尺、坐标轴、形状生成器、层次与力导向布局、Delaunay、等值线、地理投影。场景先用 D3 算好布局、建好 SVG，再在每个时刻用 D3 的插值器与缓动算出画面，所以前进、后退和导出视频时同一时刻的画面相同。D3 自己的 transition 与 timer 跑在它自己的时钟上，不能跳转，这里一律不用。

(axis-zoom)=
## 比例尺与坐标轴：缩放定义域

(axis-zoom-scene)=
:::{scene} axis-zoom
:durations: 1.2, 1.6, 1.2
九十个点画在线性比例尺上，坐标轴放大到一段区间，再用颜色与半径编码数值。
:::

`scaleLinear` 把数据映射到画面，坐标轴由 `axisBottom`、`axisLeft` 从比例尺画出，点依次出现。

缩放只是换一个定义域：两个轴的定义域由 `d3.interpolate` 插值，刻度每一帧按新的比例尺重画。

同一个值再交给两个比例尺：`scaleSequential` 给颜色，`scaleSqrt` 给半径。

(data-join)=
## 数据连接：enter、update、exit

(data-join-scene)=
:::{scene} data-join
:durations: 1, 1.4, 1.4, 1.4
字母组成的单词按键连接，保留的字母滑到新位置，新字母落下，删掉的字母掉出。
:::

`selection.data(数据, 键)` 把字母和元素按键对应，第一个词的字母都是 enter，从上方落下。

换成新词：键相同的字母是 update，滑到新位置；新的键 enter，绿色落下；消失的键 exit，红色掉出。

再换一次，同样的三种情况。

最后一个词，只剩 e、x、i、t 四个字母。

(line-draw)=
## 折线与面积：描线和读数

(line-draw-scene)=
:::{scene} line-draw
:durations: 1.6, 1.8, 1
时间序列的折线从左到右画出，一条读数线扫过并显示日期与数值，然后折线下的面积填上颜色。
:::

`scaleTime` 加 `d3.line` 画出折线，`pathLength` 设为 1 后用虚线偏移从左到右描出来。

读数线沿时间轴移动：`x.invert` 把位置换回日期，`d3.bisector` 找到最近的数据点，`d3.format` 格式化数值。

`d3.area` 用同一组点画出面积，淡淡地填上。

(bar-race)=
## 条形图竞赛：数值与名次一起插值

(bar-race-scene)=
:::{scene} bar-race
:durations: 0.8, 1.4, 1.4, 1.4, 1.4
十种编程语言的条形按年份变化，名次交换时条形上下穿过，横轴跟着最大值伸缩。
:::

第一年的条形从左向右长出，按数值排好名次。

到下一年：数值与名次都在两年之间插值，超过别人的条形从下方穿上去，横轴的定义域每帧跟着最大值。

再下一年，排在七名以外的条形淡出，挤进前七的淡入。

继续比较，左下角的年份跟着数字往前走。

最后一年，名次定下来。

(histogram)=
## 直方图：分箱与核密度

(histogram-scene)=
:::{scene} histogram
:durations: 2, 1.2, 1.2
五百个样本逐渐到来，直方图随之长高；箱宽从 2.5 变成 10，最后画出核密度曲线。
:::

样本一个一个到来，`d3.bin` 每帧对前 n 个样本重新分箱，底部的短线是每个样本的位置。

箱宽从 2.5 换成 10：两套分箱交叉淡入淡出，纵轴随最大计数缩放。

用高斯核估计密度（`d3.mean` 对每个位置求和），曲线描在直方图上，两个峰一目了然。

(stack-stream)=
## 堆叠面积与河流图

(stack-stream-scene)=
:::{scene} stack-stream
:durations: 1.4, 1.8, 1
六个研究方向的堆叠面积图一层层长出，再变成上下对称的河流图，最后突出其中一层。
:::

`d3.stack` 算出每层的上下边界，各层从下面那一层的顶上依次长起来。

换成 `stackOffsetWiggle` 与 `stackOrderInsideOut` 就是河流图：两种布局按键对应，每个点的上下边界逐点插值。

突出「语音」一层，其他层变淡，标签放在它最宽的地方。

(pie-arcs)=
## 饼图与环图：插值角度

(pie-arcs-scene)=
:::{scene} pie-arcs
:durations: 1.2, 1, 1.4
算力分配的饼图扫开，变成圆角环图，然后换成两年后的数据，每段弧转到新的角度。
:::

`d3.pie` 算出每段的起止角，`d3.arc` 画出扇形，整个饼按角度从零扫开。

内半径、段间空隙与圆角一起长出来，饼图变成环图，百分比标在每段弧的中间。

数据变了：插值的是每段弧的起止角，再交给 `d3.arc` 重画，而不是插值路径字符串。

(heatmap-scales)=
## 颜色比例尺：顺序、发散与分级

(heatmap-scales-scene)=
:::{scene} heatmap-scales
:durations: 1.4, 1.2, 1.2
一个二维矩阵的热力图沿对角线填色，再换成以零为中心的红蓝发散色，最后变成七级分级色。
:::

`scaleSequential` 配 `interpolateViridis`，格子沿对角线依次填上颜色，下方是图例与坐标轴。

换成 `scaleDiverging` 配 `interpolateRdBu`：零是白色，正负各一种颜色，格子在 Lab 空间里过渡。

`scaleQuantize` 把连续值分成七级，图例变成七个色块。

(tree-morph)=
## 树、聚类树与径向树：布局之间插值

(tree-morph-scene)=
:::{scene} tree-morph
:durations: 1.6, 1.2, 1.6
计算机学科的层次一层层长成树，叶子对齐成聚类树，再弯成以根为中心的径向树。
:::

`d3.hierarchy` 加 `d3.tree` 算出整齐树，每一层从父节点的位置长出来，连线是 `linkHorizontal`。

换成 `d3.cluster`：叶子都排到最右一列，节点位置在两种布局之间插值。

再换成极坐标下的 `d3.tree` 与 `pointRadial`：`linkRadial` 与 `linkHorizontal` 的路径都写成 M 加 C，`interpolateString` 可以直接混合。

(force-path)=
## 力导向图：稳定后找最短路

(force-path-scene)=
:::{scene} force-path
:durations: 1, 2, 1.6
三十四个节点从叶序排列出发，在力的作用下散开稳定，再沿最短路径点亮一条路线。
:::

节点出现在 `d3-force` 的初始位置：一个向日葵式的叶序螺旋。

力导向布局逐步稳定：模拟在构建时停下并跑满两百步，每一帧在相邻两步之间插值。

广度优先搜索找出从起点到最远节点的最短路，一个红点沿路走过，经过的边与节点变红。

(pack-zoom)=
## 圆堆积：用 interpolateZoom 飞过去

(pack-zoom-scene)=
:::{scene} pack-zoom
:durations: 1.4, 1.6, 2
嵌套的圆按层出现，镜头推进「人工智能」，再拉远并推到「系统」。
:::

`d3.pack` 按数值把叶子装进父圆，从外层到内层依次出现。

`d3.interpolateZoom` 在两个视野之间插值，镜头推进「人工智能」，小圆的名字随着变大显示出来。

从一个子圆到另一个：插值先拉远再推近，像飞过去一样。

(treemap-tiling)=
## 矩形树图：两种切分与放大

(treemap-tiling-scene)=
:::{scene} treemap-tiling
:durations: 1.2, 1.6, 1.4
矩形树图按层长出，从近似正方形的切分换成按层横竖交替的切分，再放大到「机器学习」一组。
:::

`d3.treemap` 默认用 `treemapSquarify`，让每块尽量接近正方形；先出现大组，再出现叶子。

换成 `treemapSliceDice`：一层横切、一层竖切，每个矩形在两种布局之间插值。

放大到「机器学习」：两个线性比例尺的定义域收到这组的边界，所有矩形跟着比例尺重新放置。

(sunburst-zoom)=
## 旭日图：沿角度放大

(sunburst-zoom-scene)=
:::{scene} sunburst-zoom
:durations: 1.6, 1.4, 1.4
层次的环一圈圈扫开，点进「人工智能」后它占满整圈，再退回全图。
:::

`d3.partition` 在极坐标下切分，`d3.arc` 画出每一段，一圈一圈地扫开。

放大「人工智能」：角度比例尺的定义域收到它的起止角，半径比例尺往外推一圈，它的子节点占满整圈。

再退回去，同一组比例尺回到原来的定义域，整个过程可以倒着播。

(voronoi-lloyd)=
## Delaunay 与 Voronoi：Lloyd 松弛

(voronoi-lloyd-scene)=
:::{scene} voronoi-lloyd
:durations: 1, 1.2, 1, 2.4
七十个点连成 Delaunay 三角网，再画出 Voronoi 单元，最后每个点反复移到单元的重心，单元变得均匀。
:::

七十个随机点依次出现（种子固定的 `d3.randomLcg`）。

`d3.Delaunay.from` 三角剖分，`delaunay.render()` 描出三角网。

`delaunay.voronoi` 得到 Voronoi 图，每个点的单元填上颜色，三角网淡去。

Lloyd 松弛：每个点移到自己单元的 `polygonCentroid`，反复四十次，单元越来越接近大小相同的六边形。

(contour-density)=
## 等值线：二维核密度

(contour-density-scene)=
:::{scene} contour-density
:durations: 1, 1.4, 1.8
三团散点上长出密度等值线，从外圈到内圈依次着色，然后核的带宽从宽变窄，等值线随之分开。
:::

四百二十个点来自三个高斯分布。

`d3.contourDensity` 估计密度并给出等值带，`geoPath` 画出来，从外到内用 `interpolateMagma` 依次上色。

带宽从 26 缩到 9：带宽大时三团连成一片，变小后各自分开，细节也多了。

(quadtree-find)=
## 四叉树：插入与最近邻

(quadtree-find-scene)=
:::{scene} quadtree-find
:durations: 1.8, 2.4
点逐个加入四叉树，方格不断细分；然后一个探针移动，红线连到它最近的点。
:::

`d3.quadtree` 每加一个点，所在的方格满了就一分为四，`visit` 遍历出全部方格。

`quadtree.find` 查最近邻：探针沿曲线移动，红线与虚线圆连到当前最近的点。

(chord)=
## 弦图：流量矩阵

(chord-scene)=
:::{scene} chord
:durations: 1.2, 1.6, 1
五座城市之间的流动画成弦图：外圈的弧扫开，丝带从起点长到终点，再突出上海。
:::

`d3.chord` 把矩阵变成每座城市的弧，弧长是流出总量，外圈依次扫开并标上城市名。

`d3.ribbon` 画出城市之间的丝带，每条从起点的中间张开到终点的位置。

突出上海：与它相连的丝带保留，其余淡去。

(globe)=
## 地理投影：转动的地球与展开

(globe-scene)=
:::{scene} globe
:durations: 1.4, 1.8, 1.8
正射投影的地球带着经纬网转动，一条大圆航线从北京画到伦敦，然后地球展开成等距圆柱投影的平面地图。
:::

`geoOrthographic` 投影加 `geoGraticule10` 的经纬网，`projection.rotate` 让地球转起来，城市用 `geoCircle` 标出。

`d3.geoInterpolate` 沿大圆插值，航线从北京描到伦敦，红点沿航线飞，绕到背面时隐去。

`geoProjectionMutator` 混合正射与等距圆柱两个原始投影，裁剪角从 90° 开到 180°，地球展开成平面。
