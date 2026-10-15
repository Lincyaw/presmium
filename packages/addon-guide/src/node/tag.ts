/**
 * A Vue component tag in a Slidev slide, as the slides renderer writes one:
 * strings as attributes, other values as JavaScript expressions (JSON with `'`
 * and `&` escaped, so it stays valid inside single quotes).
 */
export function componentTag(name: string, props: Record<string, unknown>): string {
  const attrs = Object.entries(props).map(([key, value]) => typeof value === 'string'
    ? ` ${key}="${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}"`
    : ` :${key}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`)
  return `<${name}${attrs.join('')} />`
}
