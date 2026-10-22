export interface DocumentParams {
  textDocument: { uri: string }
}

export interface PositionParams extends DocumentParams {
  position: { line: number, character: number }
}

export const PREVIEW_REQUEST = 'presmium/preview'

export interface Preview {
  entry: string
  url: string
}

export const SECTION_REQUEST = 'presmium/section'

/** The section at a position in a source file, and its page in the web form. */
export interface SectionLocation {
  entry: string
  id: string
  index: number
  title: string
  link: string
}
