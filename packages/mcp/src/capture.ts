import { CAPTURE_MAX_BOXES, CAPTURE_MAX_FRAMES, CAPTURE_SHEET_SIZE } from '@lincyaw/kernel'
import type { DocumentCapture, OverviewCaptureRequest, ReadingCaptureRequest, SlideCaptureRequest } from '@lincyaw/kernel'
import type { Call, ToolSpec } from './mcp.ts'

/** A tool's own MCP content (pictures with their text), returned as it is, with its structured part. */
export class ToolContent {
  readonly content: ({ type: 'text', text: string } | { type: 'image', data: string, mimeType: string })[]
  readonly structured: Record<string, unknown>
  constructor(content: ToolContent['content'], structured: Record<string, unknown>) {
    this.content = content
    this.structured = structured
  }
}

function service(call: Call): DocumentCapture {
  if (!call.host.capture) throw Object.assign(new Error('capture-unavailable'), { status: 503 })
  return call.host.capture
}

const integers = (max: number) => ({ type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1, maxItems: max })
const IMAGES = { type: 'boolean', description: 'Return the pictures in the result (default true); false returns only their files and boxes.' }

export const CAPTURE_TOOLS: ToolSpec[] = [
  {
    name: 'capture_slides',
    description: `Takes pictures of one page's slides as the presentation shows them, in the workspace service's headless browser, and returns them as PNG images with their files. By default each step's rest frame (the final state of its animation, what a reader sees when the step settles); with \`at\`, moments that many milliseconds into each step's animation, to see how it moves. With \`measure\` (a CSS selector), it also returns the boxes of the matching elements in the slide, in slide pixels, with their text and data-* attributes. Use it after changing a page, a component or a scene to check what each step shows (layout, overflow, overlaps, text, colours in dark appearance) before saying the change works, instead of scripting a browser. At most ${CAPTURE_MAX_FRAMES} pictures a call (steps × at). When it fails because the page cannot be prepared, get_diagnostics says why.`,
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'The document directory (list_documents); omit it when the host serves one document.' },
        section: { type: 'string', description: 'The page: its section id (list_sections) or its number from 1.' },
        steps: { ...integers(CAPTURE_MAX_FRAMES), description: 'Steps of the page, from 0; every step when omitted.' },
        at: { type: 'array', items: { type: 'number', minimum: 0 }, minItems: 1, maxItems: CAPTURE_MAX_FRAMES, description: 'Milliseconds into each step\'s animation; the rest frame when omitted.' },
        appearance: { enum: ['light', 'dark'], description: 'The colour scheme (default light).' },
        scale: { enum: [1, 2], description: 'Device pixels per slide pixel (default 1; 2 for fine detail).' },
        clip: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } }, required: ['x', 'y', 'width', 'height'], additionalProperties: false, description: 'Only this region of the slide, in slide pixels.' },
        measure: { type: 'string', minLength: 1, maxLength: 200, description: `A CSS selector inside the slide; up to ${CAPTURE_MAX_BOXES} boxes a picture.` },
        arrive: { enum: ['direct', 'backward'], description: 'direct (default): each step drawn from its step and moment. backward: the step after is shown first, then the presentation goes back to the step as a presenter does, with the page\'s own clock, to check that going back shows the right frame (compare with direct pictures); `at` does not apply.' },
        images: IMAGES,
      },
      required: ['section'],
      additionalProperties: false,
    },
    kind: 'read',
    structured: true,
    run: async (call) => {
      const { document: _document, images: inline = true, ...request } = call.args as unknown as SlideCaptureRequest & { document?: string, images?: boolean }
      return pictures(await service(call).slides(await call.document(), request, call.signal), inline)
    },
  },
  {
    name: 'capture_reading',
    description: `Takes a picture of one page of the reading version (the web page) as a reader sees it, in the workspace service's headless browser, at a window width (default ${1280}; 390 for a phone): the whole section, scrolled through so that its components load and drawn at rest, as a PNG image with its file. With \`measure\` (a CSS selector), it also returns the boxes of the matching elements in the section, in CSS pixels. Use it after changing a page to check its reading version (text, figures, tables, code, components, the phone layout, the dark appearance) before saying the change works, instead of scripting a browser. Very long sections are cut at 8000 pixels.`,
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'The document directory (list_documents); omit it when the host serves one document.' },
        section: { type: 'string', description: 'The page: its section id (list_sections) or its number from 1.' },
        width: { type: 'integer', minimum: 320, maximum: 2560, description: 'The window width in CSS pixels (default 1280; 390 for a phone).' },
        appearance: { enum: ['light', 'dark'], description: 'The colour scheme (default light).' },
        scale: { enum: [1, 2], description: 'Device pixels per CSS pixel (default 1).' },
        measure: { type: 'string', minLength: 1, maxLength: 200, description: `A CSS selector inside the section; up to ${CAPTURE_MAX_BOXES} boxes.` },
        images: IMAGES,
      },
      required: ['section'],
      additionalProperties: false,
    },
    kind: 'read',
    structured: true,
    run: async (call) => {
      const { document: _document, images: inline = true, ...request } = call.args as unknown as ReadingCaptureRequest & { document?: string, images?: boolean }
      return pictures(await service(call).reading(await call.document(), request, call.signal), inline)
    },
  },
  {
    name: 'capture_overview',
    description: `Takes the whole presentation at once, page by page in reading order, as the workspace service's headless browser draws it: each page's last step (default) or every step of every page (\`steps: 'all'\`), at rest. Returns sheets of labelled thumbnails (page from 1 · step from 0, as the other tools count them  title, ${CAPTURE_SHEET_SIZE} a sheet) as PNG images, and the full-size picture of every frame as files in one directory, named to sort in reading order (03-12-page.png: page 3, step 12). Use it to review a whole piece: give the sheets or the directory to a fresh reader for a cold-read review (does each page say what it should, is every concept introduced before it is used, do terms stay the same), and to compare before and after a round of changes. For a single page use capture_slides.`,
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'The document directory (list_documents); omit it when the host serves one document.' },
        steps: { enum: ['last', 'all'], description: 'last (default): each page\'s last step; all: every step of every page.' },
        appearance: { enum: ['light', 'dark'], description: 'The colour scheme (default light).' },
        columns: { type: 'integer', minimum: 1, maximum: 8, description: 'Thumbnails a row on a sheet (default 4).' },
        images: IMAGES,
      },
      additionalProperties: false,
    },
    kind: 'read',
    structured: true,
    run: async (call) => {
      const { document: _document, images: inline = true, ...request } = call.args as unknown as OverviewCaptureRequest & { document?: string, images?: boolean }
      return pictures(await service(call).overview(await call.document(), request, call.signal), inline)
    },
  },
]


/** The pictures as images after their description, or only the description (with the files) when not inline. */
function pictures<T extends { images: Uint8Array[] }>(captured: T, inline: boolean): ToolContent {
  const { images, ...structured } = captured
  return new ToolContent([
    { type: 'text', text: JSON.stringify(structured, null, 2) },
    ...inline ? images.map(png => ({ type: 'image' as const, data: Buffer.from(png).toString('base64'), mimeType: 'image/png' })) : [],
  ], structured)
}
