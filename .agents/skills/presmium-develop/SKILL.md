---
name: presmium-develop
description: "Develop and debug Presmium plugins: versioned component definitions, shared React components through @lincyaw/host, static fallbacks, browser and Node services, routes, passes, executors and renderers. Use for a plugin project created by presmium new --type plugin. 开发、调试和真实验证 Presmium 插件时使用。"
---

# Developing a Presmium plugin

A document is a folder with `lecture.json`: Presmium's normalized editable document IR. Its metadata lists plugins; content component blocks reference a versioned definition with an implementation, parameter Schema and declared states. The compiler derives the runtime snapshot consumed by the web page, slides, notebook and other renderers. Do not introduce MyST syntax or another editable content file.

## Start from the public example

`presmium new plugin-name --type plugin` creates the Node entry `src/node/presmium.ts`, shared pure TypeScript in `src/domain`, `components/GreetingCard.tsx` and `example/lecture.json`. The example defines a component using the plugin and a server route that counts waves. Read [the plugin contract](references/plugin.md) and [verification](references/testing.md).

```sh
pnpm install
presmium check example --json
presmium dev example --to web,slides
presmium build example --to notebook
```

The CLI is a project dependency; use its package scripts or `pnpm exec presmium` in a shell. Components must work through the real installed host in both web and slides; notebook and exports need readable static fallbacks. A compile success does not prove component interaction or a route works.

## Put behavior at its boundary

- `src/domain` contains pure shared types, plugin/component IDs and bilingual messages. It does not import Node, React or a browser.
- `src/node/presmium.ts` exports a `PresmiumNodePlugin`: server routes, services, checks, compile passes, executors or renderer support only when the feature needs them.
- `components` contains React components. Read step state, playback time and services through `@lincyaw/host`; do not import another addon package's internal implementation.
- `src/client/plugin.ts` optionally registers browser services and toolbar contributions; `src/client/viewer.ts` optionally extends the derived viewer. Use their public exported types.
- The authoring definition owns versioned parameter and state contracts. Unknown plugin data stays intact, is shown with fallback/diagnostics and is never stripped to make a document appear editable.

Keep host, kernel, viewer and React as peer dependencies so consumers have one context/token registry. Publish `.ts`/`.tsx` sources, with `.ts` on relative imports, package exports and required assets. Read dependencies through public interfaces; do not fork, patch or import their internals.

## Interaction and style

A component's state is a pure function of the resolved step and time. Arbitrary step jumps must rebuild it; subscriptions, timers and animation resources are disposed when inactive/unmounted. Use actual declared capabilities, never prototype-only controls.

Use public `Pm*` controls, semantic icons and design tokens through `@lincyaw/host`. Keep all zh-CN and en text together; compiled strings follow the document's language. Business CSS owns layout and cannot override a public control. Check real light/dark and desktop/narrow layouts.

Changes to the Node entry require restarting the development service. Saving document JSON triggers snapshot compilation independently of authoring save; never write back generated snapshot fields or claim an older snapshot is current. Keep provider credentials and operator execution settings outside document metadata.
