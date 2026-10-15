/**
 * Requests of the Presmium language server beside the standard LSP ones,
 * shared with its clients (the VS Code extension). They serve the preview
 * sync of P-81: the client opens the `presmium dev` preview of a deck and
 * keeps it on the section at the cursor.
 */

export interface DocumentParams {
  textDocument: { uri: string }
}

export interface PositionParams extends DocumentParams {
  /** 0-based line and character, as in LSP. */
  position: { line: number, character: number }
}

/** `presmium/preview`: starts `presmium dev --to web` for the deck of a document, or reuses the running one. */
export const PREVIEW_REQUEST = 'presmium/preview'

export interface Preview {
  /** Absolute path of the deck entry. */
  entry: string
  /** Base URL of the web dev server, e.g. `http://localhost:5173/`. */
  url: string
}

/** `presmium/section`: the section of a deck at a position of one of its source files; null outside any deck. */
export const SECTION_REQUEST = 'presmium/section'

export interface SectionAt {
  /** Absolute path of the deck entry. */
  entry: string
  id: string
  /** 1-based, the slide number. */
  index: number
  title: string
  /** Link of the section in the web form relative to the site base: its page and, unless it opens the page, `#<id>`. */
  link: string
}
