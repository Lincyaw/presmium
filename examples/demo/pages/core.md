---
class: pm-core
presmium:
  presmium.core:
    demo: true
---

# 宿主适配

<div class="grid grid-cols-2 gap-x-10 gap-y-4 mt-6">
<div>

**服务依赖**：消费方插件拿到提供方的实现

<PmDemoGreeting />

**步骤驱动**：状态由步骤推导，跳转与逐步前进一致

<PmDemoStepper />

</div>
<div>

**动画**：减少动态效果时直接显示终态

<PmDemoAnimated />

**错误边界**：出错的组件只影响自身

<PmDemoBroken />

</div>
</div>

<div doc-only>网页形态中才出现的补充说明：本页的演示插件由 <code>presmium.core.demo</code> 配置启用。</div>

<!--
本页的三个演示插件由页 frontmatter 的 `presmium.core.demo` 启用：presmium.demo.provider 提供问候服务，presmium.demo.consumer 依赖它，presmium.demo.orphan 缺少必需服务而被禁用。

启动报告与组件错误显示在演讲者视图左下角的 Presmium 面板中。
-->
