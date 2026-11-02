/**
 * Pictures of a document as its presentation shows it, taken by the workspace service in a headless browser: the rest
 * frame of each step, or a moment into a step's animation, with the boxes of the elements an agent asks about. Agents
 * (over MCP) check animations and layout with it instead of scripting a browser.
 */

/** At most this many pictures a request: each is one image in a tool result. */
export const CAPTURE_MAX_FRAMES = 12
/** At most this many boxes a picture reports for `measure`. */
export const CAPTURE_MAX_BOXES = 200

export interface SlideCaptureRequest {
  /** The page (section) id, or its number from 1. */
  section: string
  /** The steps to show, from 0; every step of the page when omitted. */
  steps?: number[]
  /** Milliseconds into each step's animation; each step's rest frame (its final state) when omitted. */
  at?: number[]
  appearance?: 'light' | 'dark'
  /** Device pixels per slide pixel. */
  scale?: 1 | 2
  /** A region of the slide, in slide pixels. */
  clip?: { x: number, y: number, width: number, height: number }
  /** A CSS selector: the boxes of the matching elements in the slide are reported, in slide pixels. */
  measure?: string
  /**
   * How the presentation reaches each step: `direct` (default) draws it from its step and moment; `backward` shows the
   * step after it first and goes back as a presenter does, with the page's own clock, to check that going back works.
   */
  arrive?: 'direct' | 'backward'
}

export interface ReadingCaptureRequest {
  /** The page (section) id, or its number from 1. */
  section: string
  /** The window's width in CSS pixels (default 1280; 390 for a phone). */
  width?: number
  appearance?: 'light' | 'dark'
  /** Device pixels per CSS pixel. */
  scale?: 1 | 2
  /** A CSS selector: the boxes of the matching elements in the page's section are reported, in CSS pixels. */
  measure?: string
}

export interface CapturedReading {
  section: string
  /** The PNG file of the picture, in the service's state directory. */
  file: string
  /** The section's size in CSS pixels; the picture is cut at `CAPTURE_MAX_HEIGHT`. */
  width: number
  height: number
  cut: boolean
  boxes?: CapturedBox[]
}

export interface ReadingCaptureResult {
  document: string
  width: number
  frames: CapturedReading[]
  problems: string[]
}

/** The tallest picture of a reading page's section, in CSS pixels. */
export const CAPTURE_MAX_HEIGHT = 8000

export interface CapturedBox {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  /** The start of the element's text. */
  text: string
  /** Its `id`, `class` and `data-*` attributes. */
  attributes: Record<string, string>
}

export interface CapturedSlide {
  section: string
  slide: number
  step: number
  /** Milliseconds into the step, or null for its rest frame. */
  at: number | null
  /** The PNG file of the picture, in the service's state directory. */
  file: string
  width: number
  height: number
  boxes?: CapturedBox[]
}

export interface SlideCaptureResult {
  document: string
  /** The slide's size in slide pixels. */
  shape: { width: number, height: number }
  frames: CapturedSlide[]
  /** What failed in the page while it was drawn: component errors, page errors. */
  problems: string[]
}

export interface OverviewCaptureRequest {
  /** Each page's last step (default), or every step of every page. */
  steps?: 'last' | 'all'
  appearance?: 'light' | 'dark'
  /** Thumbnails a row on a sheet (default 4). */
  columns?: number
}

export interface OverviewCaptureResult {
  document: string
  /** The directory of the pictures, named so that they sort in reading order (`03-12-page.png`: page 3, step 12 from 0). */
  dir: string
  frames: { section: string, slide: number, step: number, file: string }[]
  /** Sheets of thumbnails, at most `CAPTURE_SHEET_SIZE` each, in order. */
  sheets: string[]
  problems: string[]
}

/** Thumbnails on one overview sheet; and the most pictures an overview takes. */
export const CAPTURE_SHEET_SIZE = 20
export const CAPTURE_MAX_OVERVIEW = 400

export interface DocumentCapture {
  /** The pictures, with their PNG bytes in the order of `frames`. */
  slides(document: string, request: SlideCaptureRequest, signal?: AbortSignal): Promise<SlideCaptureResult & { images: Uint8Array[] }>
  /** A page of the reading version (the web page), with its PNG bytes. */
  reading(document: string, request: ReadingCaptureRequest, signal?: AbortSignal): Promise<ReadingCaptureResult & { images: Uint8Array[] }>
  /** Every page's rest frames as the presentation shows them, as files and as sheets of thumbnails (the images). */
  overview(document: string, request: OverviewCaptureRequest, signal?: AbortSignal): Promise<OverviewCaptureResult & { images: Uint8Array[] }>
}

/** The hook a viewer page opened with `?capture` installs, which the capturing browser drives. */
export interface CaptureHook {
  /** A slide at a step: drawn at the moment `at` (its rest frame when omitted), or reached going back from the step after. */
  show(position: { section: string, step: number, at?: number, arrive?: 'direct' | 'backward' }): Promise<{ problems: string[] }>
  /** A section of the reading page, scrolled through so that its components load, at rest. */
  read(section: string): Promise<{ problems: string[] }>
}

export const CAPTURE_HOOK = 'presmiumCapture'
export const CAPTURE_PARAM = 'capture'
