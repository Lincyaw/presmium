(core)=
## 宿主适配

:::{hints}
slides: { class: pm-core }
:::

本章演示宿主适配：插件之间通过服务协作，组件的状态由步骤推导，动画尊重减少动态效果的设置，出错的组件只影响自身。三个演示插件由文稿 frontmatter 中的 `presmium.core.demo` 启用。

:::{slide}
**服务依赖**：消费方插件拿到提供方的实现
:::

:::{component} PmDemoGreeting
:::

presmium.demo.provider 提供问候服务，presmium.demo.consumer 依赖它，presmium.demo.orphan 缺少必需服务而被禁用。启动报告显示在演讲者视图的 Presmium 面板中。

:::{slide}
**步骤驱动**：状态由步骤推导，跳转与逐步前进一致
:::

:::{component} PmDemoStepper
:span: 2
steps: [解析文稿, 启动插件, 渲染页面]
:::

第一步突出“解析文稿”：步进组件的状态完全由步骤推导。

第二步突出“启动插件”。

第三步突出“渲染页面”：直接跳到这一步与从第零步逐步前进到这里，页面完全一致。

:::{slide}
**动画**：减少动态效果时直接显示终态
:::

:::{component} PmDemoAnimated
:::

:::{slide}
**错误边界**：出错的组件只影响自身
:::

:::{component} PmDemoBroken
:::

故意抛错的组件显示错误占位，本页其他内容照常渲染，错误同时列在演讲者面板中。

:::{only} web
网页形态中才出现的补充说明：本章的演示插件由 `presmium.core.demo` 配置启用。
:::
