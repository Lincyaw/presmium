---
title: Presmium 功能测试文稿
lang: zh-CN
plugins:
  - '@lincyaw/slidev-addon-core'
  - '@lincyaw/slidev-addon-stage'
  - '@lincyaw/slidev-addon-code'
  - '@lincyaw/slidev-addon-exec'
  - '@lincyaw/slidev-addon-exec-local'
  - '@lincyaw/slidev-addon-guide'
  - '@lincyaw/slidev-addon-content'
  - '@lincyaw/slidev-addon-publish'
  - '@lincyaw/slidev-addon-session'
  - '@lincyaw/slidev-addon-classroom'
  - ./host/plugin
  - ./host/services
  - ./content/plugin
renderers:
  web: {}
  slides:
    theme: default
---

# Presmium 功能测试文稿

:::{slide}
e2e/publish.spec.ts 的测试文稿：每个插件的页面都在这里，用来检查离线放映与高对比度。
:::

除了本目录的 `publish.md`，其他页面来自各自的测试文稿目录，构建时复制到本文稿中（`e2e/fixtures/deck.ts`）；PlantUML 图已下载到 `.presmium/assets`。

```{include} host/host.md
```

```{include} stage/stage.md
```

```{include} code/code.md
```

```{include} exec/panels/exec.md
```

```{include} exec-local/exec-local.md
```

```{include} guide/guide.md
```

```{include} content/content.md
```

```{include} publish.md
```

```{include} session/web.md
```

```{include} session/session.md
```

```{include} plugins/classroom.md
```
