// The brand of the series: 翰林院传达室 (Hanlin Dispatch), its courier-cat mark (from the logo concepts of the brand,
// concept B) and the docked mark every scene after the opening shows in its corner.
import mark from './brand/mark.svg?raw'

/** The mark as inline SVG, sized by its container. */
export const MARK = mark.replace(/ width="\d+" height="\d+"/, '')

export const BRAND = { name: '翰林院传达室', en: 'Hanlin Dispatch', series: '三分钟读完一篇论文' }
