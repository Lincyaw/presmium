/**
 * Recording a media track into a file (P-90). Audio is encoded to Ogg/Opus
 * through WebCodecs with Mediabunny, the same file in every browser that
 * has an Opus encoder, with its length and seekable; video (camera, screen)
 * to WebM. Without WebCodecs audio, MediaRecorder records what the browser
 * offers (Ogg/Opus where it can, else WebM), whose length the track gives.
 * The bytes go to a sink as they come, each with its position in the file:
 * the WebM muxer writes its header last.
 */
import { canEncodeAudio, getFirstEncodableVideoCodec, MediaStreamAudioTrackSource, MediaStreamVideoTrackSource, OggOutputFormat, Output, Quality, StreamTarget, WebMOutputFormat } from 'mediabunny'

export interface Chunk {
  data: Uint8Array<ArrayBuffer>
  position: number
}

export type Sink = (chunk: Chunk) => void

export interface Capture {
  /** Extension of the file it makes. */
  ext: 'ogg' | 'webm' | 'mp4'
  /** Ends the recording; resolves once the last bytes went to the sink. */
  stop(): Promise<void>
  /** Rejects when the recording fails. */
  failed: Promise<never>
}

/** Speech: Opus at 24 kbps, about 11 MB an hour (docs/ir.md 9.1). */
const SPEECH = new Quality({ bitrate: 24_000 })

function target(sink: Sink): StreamTarget {
  return new StreamTarget(new WritableStream({ write: chunk => sink({ data: chunk.data, position: chunk.position }) }))
}

/** Records with Mediabunny: `output` gets one track from `source`. The track is a clone of the caller's, stopped at the end. */
async function withOutput(output: Output, clone: MediaStreamTrack, source: MediaStreamAudioTrackSource | MediaStreamVideoTrackSource, ext: Capture['ext']): Promise<Capture> {
  if (source instanceof MediaStreamAudioTrackSource) output.addAudioTrack(source)
  else output.addVideoTrack(source)
  const failed = source.errorPromise.then(() => new Promise<never>(() => {}))
  await output.start()
  return {
    ext,
    failed,
    async stop() {
      await output.finalize()
      clone.stop()
    },
  }
}

/** A recording with MediaRecorder, a chunk a second, written one after another. */
function withRecorder(clone: MediaStreamTrack, sink: Sink): Capture | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const type = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t))
  if (!type) return undefined
  const recorder = new MediaRecorder(new MediaStream([clone]), { mimeType: type, audioBitsPerSecond: 24_000 })
  let position = 0
  let writing = Promise.resolve()
  recorder.ondataavailable = (event) => {
    writing = writing.then(async () => {
      const data = new Uint8Array(await event.data.arrayBuffer())
      sink({ data, position })
      position += data.byteLength
    })
  }
  const failed = new Promise<never>((_, fail) => {
    recorder.onerror = event => fail(new Error(String((event as ErrorEvent).message ?? 'MediaRecorder failed')))
  })
  recorder.start(1000)
  return {
    ext: type.startsWith('audio/ogg') ? 'ogg' : type.startsWith('audio/webm') ? 'webm' : 'mp4',
    failed,
    stop: () => new Promise((done) => {
      recorder.onstop = () => void writing.then(() => {
        clone.stop()
        done()
      })
      recorder.stop()
    }),
  }
}

/** Records audio from a track of a stream into Ogg/Opus, or what the browser's MediaRecorder makes; undefined when it can neither. */
export async function captureAudio(track: MediaStreamTrack, sink: Sink): Promise<Capture | undefined> {
  const clone = track.clone()
  if (await canEncodeAudio('opus').catch(() => false)) {
    const output = new Output({ format: new OggOutputFormat({ maximumPageDuration: 1 }), target: target(sink) })
    return withOutput(output, clone, new MediaStreamAudioTrackSource(clone as MediaStreamAudioTrack, { codec: 'opus', quality: SPEECH }), 'ogg')
  }
  const fallback = withRecorder(clone, sink)
  if (!fallback) clone.stop()
  return fallback
}

/** Records a camera or the screen into WebM (VP9, VP8 or AV1, as the browser encodes); undefined when it cannot. */
export async function captureVideo(track: MediaStreamTrack, sink: Sink): Promise<Capture | undefined> {
  const { width, height } = track.getSettings()
  const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width, height }).catch(() => null)
  if (!codec) return undefined
  const clone = track.clone()
  const output = new Output({ format: new WebMOutputFormat({ minimumClusterDuration: 1 }), target: target(sink) })
  return withOutput(output, clone, new MediaStreamVideoTrackSource(clone as MediaStreamVideoTrack, { codec, quality: new Quality('medium') }), 'webm')
}
