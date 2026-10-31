---
'@lincyaw/design': patch
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/web': patch
'@lincyaw/kernel': patch
---

The studio reads like an editor, and its styles take every value from the design tokens.

- `@lincyaw/design`: tokens for the editor's frame (`chrome`, `canvas`, `hover`, `accent-line` and `backdrop` colours, `--pm-shadow-page`), sizes (`--pm-size-*`), the bars and panes (`--pm-appbar-height`, `--pm-toolbar-height`, `--pm-navigation-width`, `--pm-aside-width`, `--pm-sheet-width`…), `--pm-space-px`, the `tool` and `sheet` radii and the `spin` and `pulse` durations; the `navigation` icon. The unused `--pm-activity-width` and `--pm-sidebar-width` are gone.
- `@lincyaw/dsh`: an app bar across the top (the brand, the path to the open document or panel, the AI assistant, More, Settings and Help) in place of the activity bar; hairline column handles.
- `@lincyaw/workbench`: the document view has a command bar of flat grouped commands, a navigation pane (the sections, or the numbered slides) that goes to a section, the document on a canvas (a slide at the deck's `aspectRatio`), and a status bar with the section or slide, the word count and what the mode allows; the documents are listed as rows. `DocumentView` takes `framed` when the layout shows the title; `Workbench.goToSection` and `WorkbenchState.position`.
- `@lincyaw/web`: in a workbench's preview the document is one page on the canvas, without the site's navigation bar, search, sidebar, outline or heading permalinks.
- `@lincyaw/kernel`: `isPreviewEmbedded()` tells a page that a workbench embeds it.
- `@lincyaw/addon-core`: in a workbench's preview the player's letterbox takes the canvas colour and its navigation controls are hidden.
