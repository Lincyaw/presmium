# {{name}}: a Presmium plugin

Presmium compiles MyST documents to an intermediate representation (IR) and renders it as a web page
(VitePress), slides (Slidev), a notebook and more. A plugin adds directives that become IR nodes, Vue
components that show those nodes in the web page and the slides alike, services and server routes.
This project is one plugin, `{{id}}`: `README.md` lists its files.

## Skills

- `.agents/skills/presmium-develop`: how Presmium plugins are made: the contracts, the host's interface,
  the design system, directives, components, server routes, renderer extensions and tests. Its
  `references/plugin.md` walks through a plugin. It is written for the Presmium repository
  (https://github.com/Lincyaw/presmium): its paths `packages/...` and `docs/...` are there, and
  what it says of `workspace:` ranges, changesets and the repository's checks does not apply here.
- `.agents/skills/presmium-author`: how documents are written, for `example/lecture.md`.

## Conventions

- Layering: `src/domain` is pure TypeScript (no Vue, Node, `@presmium/host` or framework); the
  component and any `src/client` code get step state, text and services from `@presmium/host` only, never
  `@slidev/*` or `vitepress`, so they run in both forms; `src/node` uses no Vue. A `setup/` directory
  (loaded in the slides form only) may use `@slidev/client`'s public exports. Never import a
  framework's internal paths.
- Text has Chinese and English (`GREETING_MESSAGES`): the component picks by the page's language with
  `useMessages`; text written into the output at compile time follows the document's `lang`
  (`deckLocale(ctx.lang)`).
- A component's visual state is a pure function of the step (`useStepState`), so stepping back
  undoes it. Styles use the design system's tokens (`var(--pm-color-ink)`, ...) and controls
  (`PmButton`, ...).
- The plugin declares `kernel: '^1.0.0'` (the plugin contract) and its `version` from `package.json`;
  `@presmium/kernel`, `host`, `viewer` and `compiler` are peer dependencies.
- Sources ship as `.ts` and `.vue`, not compiled; relative imports end in `.ts`.
- Tests are integration tests only: they run the real `presmium` CLI (`@presmium/cli/testing`),
  builds and servers on documents, never mocks of Presmium, Slidev or VitePress; one or two cases
  for each thing the plugin promises.

## Commands

- `npm test`: the integration tests (Vitest).
- `npm run dev`: `presmium dev` of the example, in the web page and the slides; the example names the
  plugin by its directory (`..`), so it runs the plugin's sources as they are, neither packed nor installed.
- `npm run check`, `npm run build`: `presmium check` and `build` of the example.
