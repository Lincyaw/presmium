// The document's site path: where its published files and its plugins' run-time files are. The prebuilt viewer that
// shows every document is built at no site path of its own, so the page's shell tells it; the slides form's build is
// at the document's path, which Vite gives.
let base: string | undefined

/** Sets the document's site path (ending with `/`), as the page's shell knows it. */
export function setSiteBase(value: string): void {
  base = value.endsWith('/') ? value : `${value}/`
}

/** The document's site path, ending with `/`: below it are `media/` and the plugins' run-time files (`pyodide/`). */
export function siteBase(): string {
  return base ?? import.meta.env?.BASE_URL ?? '/'
}
