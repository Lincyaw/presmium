/** Text as it reads in HTML, in an element or an attribute's value; apart from `html.ts`, so that escaping loads no HTML parser. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
