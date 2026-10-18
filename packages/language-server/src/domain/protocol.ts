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

export interface SectionAt {
  entry: string
  id: string
  index: number
  title: string
  link: string
}
