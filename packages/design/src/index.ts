/**
 * Presmium's design system (N-10, docs/design-dsh.md 3.1 and 7.5), shared by
 * the outputs and the workbench and bound to no framework: the tokens
 * (`tokens.css`), the classes of the shared components (`components.css`,
 * `pm-ui-*`), the fonts (`fonts.css`; `design.css` loads all three) and the
 * line icons. `@presmium/host` draws the components in Vue for the outputs,
 * `@presmium/workbench` in React for the workbench.
 */
export { iconMarkup, ICONS } from './icons.ts'
export type { IconName, Shape } from './icons.ts'
export { color, colorToken, COLORS, FONTS } from './tokens.ts'
export type { ColorName } from './tokens.ts'
