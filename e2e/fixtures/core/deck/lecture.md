---
title: Presmium Fixture Deck With A Title Too Long For A Phone
lang: en-US
plugins:
  - '@presmium/slidev-addon-core'
  - '@presmium/slidev-addon-session'
  - ./plugin
presmium:
  fixture.core: { label: global }
  # The learner's badge shows for an invitation (`?room=`) before anything connects.
  presmium.session: { server: 'ws://127.0.0.1:9' }
renderers:
  web: { base: /web/ }
  slides: { base: /slides/, transition: slide-left }
---

# Presmium Fixture Deck With A Title Too Long For A Phone

:::{slide}
A deck of e2e/core.spec.ts and e2e/web.spec.ts.
:::

:::{config}
fixture.core: { label: cover }
:::

```{component} FixtureConfig
```

(global)=
## Global options

```{component} FixtureConfig
```

(scoped)=
## Section options

:::{config}
fixture.core: { label: section }
:::

```{component} FixtureConfig
```

(shared)=
## Shared state

```{component} FixtureShared
```

(lifecycle)=
## Plugin lifecycle

```{component} FixtureBroken
```

```{include} pages/motion.md
```
