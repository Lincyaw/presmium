# {{name}}: a Presmium plugin

Presmium compiles MyST documents to an intermediate representation (IR) and renders it as a web page
and slides (both shown by Presmium's own viewer), a notebook and more. A plugin adds directives that
become IR nodes, React components that show those nodes in the web page and the slides alike, services
and server routes.
This project is one plugin, `{{id}}`: `README.md` lists its files.

## Skills

- `.agents/skills/presmium-develop`: how to develop, debug and test this plugin: the Node entry and its
  directives, the IR nodes they produce, components and the `@lincyaw/host` API, browser services,
  server routes, renderer extensions, the design system, and integration tests with real runs. Its
  `references/plugin.md` is the plugin contract with examples, `references/testing.md` how to prove
  behavior. It is self-contained: it needs only this project and the installed packages.
- `.agents/skills/presmium-author`: how documents are written, for `example/lecture.md`.

## Conventions

- Layering: `src/domain` is pure TypeScript (no React, Node, `@lincyaw/host` or framework); the
  component and any `src/client` code get step state, text and services from `@lincyaw/host` only,
  so they run in both forms; `src/node` uses no React. Never import a framework's internal paths.
- Text has Chinese and English (`GREETING_MESSAGES`): the component picks by the page's language with
  `useMessages`; text written into the output at compile time follows the document's `lang`
  (`deckLocale(ctx.lang)`).
- A component's visual state is a pure function of the step (`useStepState`), so stepping back
  undoes it. Styles use the design system's tokens (`var(--pm-color-ink)`, ...) and controls
  (`PmButton`, ...).
- The plugin declares `kernel: '^1.0.0'` (the plugin contract) and its `version` from `package.json`;
  `@lincyaw/kernel`, `host`, `viewer` and `compiler` are peer dependencies.
- Sources ship as `.ts` and `.tsx`, not compiled; relative imports end in `.ts`.
- Tests are integration tests only: they run the real `presmium` CLI (`@lincyaw/cli/testing`),
  builds and servers on documents, never mocks of Presmium or its frameworks; one or two cases for
  each thing the plugin promises.

## Commands

- `pnpm test`: the integration tests (Vitest).
- `pnpm dev`: `presmium dev` of the example, in the web page and the slides; the example names the
  plugin by its directory (`..`), so it runs the plugin's sources as they are, neither packed nor installed.
- `pnpm check`, `pnpm build`: `presmium check` and `build` of the example.
