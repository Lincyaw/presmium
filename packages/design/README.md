# @presmium/design

Presmium's design system, shared by its outputs (the web form and the slides) and its workbench (`presmium studio`): the tokens (`--pm-*` CSS custom properties, light and dark), the classes of the shared components (`pm-ui-*`), the fonts (IBM Plex Sans, IBM Plex Mono and Source Serif 4, SIL Open Font License 1.1, from Fontsource) and the line icons. It uses no framework.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Usage

Plugin components do not import it: `@presmium/host` loads it into every page and draws the components in Vue (`PmButton`, `PmIcon` and the others); the workbench's panels draw the same classes in React (`@presmium/workbench`). A page outside both loads the styles itself:

```ts
import '@presmium/design/design.css'
import { iconMarkup } from '@presmium/design'

button.innerHTML = `${iconMarkup('play')} Run`
```

| Export | What |
|---|---|
| `@presmium/design/design.css` | the fonts, the tokens and the components' classes |
| `@presmium/design/tokens.css`, `components.css`, `fonts.css` | each part alone |
| `ICONS`, `iconMarkup(name, size?)` | the line icons, as shapes or as SVG markup |
| `COLORS`, `color(name)`, `colorToken(name)` | the names of the colour tokens, as `var(--pm-color-<name>)` or the property |

The tokens and the components are described in `docs/architecture.md` (section 5.10) of the repository.
