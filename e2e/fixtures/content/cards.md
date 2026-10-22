(content-cards)=
## 卡片与栅格

:::{hints}
slides: { class: pm-content-cards, routeAlias: content-cards }
:::

`{grid}` 的参数是四档屏宽（手机、小、中、大）的列数；卡片的 `:link:` 使整张卡片成为链接，`+++` 之后是页脚。

::::{grid} 1 1 2 3
:::{card} 第 1 周：智能体环路
:link: https://example.com/week-01/
读、想、做的循环与它的失败方式。
+++
{button}`进入讲义 <#content-tabs>`
:::
:::{card} 第 2 周：上下文
上下文窗口里放什么。
:::
:::{card} 第 3 周：工具
页眉
^^^
工具的描述与调用。
:::
::::

(content-tabs)=
## 选项卡

:::{hints}
slides: { class: pm-content-tabs, routeAlias: content-tabs }
:::

同一 `:sync:` 的选项卡一起切换。

::::{tab-set}
:::{tab-item} Python
:sync: py
用 `print` 输出。
:::
:::{tab-item} JavaScript
:sync: js
用 `console.log` 输出。
:::
::::

::::{tab-set}
:::{tab-item} Python
:sync: py
安装：`pip install presmium`
:::
:::{tab-item} JavaScript
:sync: js
安装：`npm install presmium`
:::
::::

(content-captions)=
## 封面与字幕

:::{hints}
slides: { class: pm-content-captions, routeAlias: content-captions }
:::

```{video} @lincyaw/slidev-addon-content/media/clip.webm
:controls:
:muted:
:width: 280
:poster: films/poster.png
:captions: en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt
:captions-default: en
带封面与中英字幕的视频
```

(content-autoplay)=
## 自动播放的生命周期

:::{hints}
slides: { class: pm-content-autoplay, routeAlias: content-autoplay }
:::

```{video} @lincyaw/slidev-addon-content/media/clip.webm
:autoplay:
:controls:
:loop:
:width: 280
只在当前幻灯片自动播放。
```

(content-media-range)=
## 媒体的显示范围

:::{hints}
slides: { class: pm-content-media-range, routeAlias: content-media-range }
:::

::::{slide}
:at: 0
:until: 1

```{video} @lincyaw/slidev-addon-content/media/clip.webm
:controls:
:muted:
:loop:
第 0 步可播放，第 1 步隐藏并停止。
```
::::

:::{slide}
:at: 1
媒体已经隐藏。
:::
