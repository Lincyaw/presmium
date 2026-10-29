# @lincyaw/design

Presmium's design system, shared by its outputs (the web form and the slides) and its workbench (`presmium studio`): the tokens (`--pm-*` CSS custom properties, light and dark), the classes of the shared components (`pm-ui-*`), the fonts (IBM Plex Sans, IBM Plex Mono and Source Serif 4, SIL Open Font License 1.1, from Fontsource) and the line icons. It uses no framework.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Usage

Plugin components do not import it: `@lincyaw/host` loads it into every page and draws the components in React (`PmButton`, `PmIcon` and the others); the workbench's panels draw the same classes in React (`@lincyaw/workbench`). A page outside both loads the styles itself:

```ts
import '@lincyaw/design/design.css'
import { iconMarkup } from '@lincyaw/design'

button.innerHTML = `${iconMarkup('play')} Run`
```

| Export | What |
|---|---|
| `@lincyaw/design/design.css` | the fonts, the tokens and the components' classes |
| `@lincyaw/design/tokens.css`, `components.css`, `fonts.css` | each part alone |
| `ICONS`, `iconMarkup(name, size?)` | the line icons, as shapes or as SVG markup |
| `brandMarkup()` | the existing Presmium P as decorative SVG; load `design.css` for its token colors and size |
| `COLORS`, `color(name)`, `colorToken(name)` | the names of the colour tokens, as `var(--pm-color-<name>)` or the property |

`pm-ui-appbar` supplies the shared application chrome, `pm-ui-appbar__context` its muted context label, and `pm-ui-toolbar` the typography and minimum height of a tool group. `pm-ui-toolbar__group` and `pm-ui-toolbar__separator` group and separate public controls. Their host arranges the bars and supplies outer spacing; these classes do not replace toolbar keyboard behavior.

The tokens and the components are described in `docs/architecture.md` (section 5.10) of the repository.
