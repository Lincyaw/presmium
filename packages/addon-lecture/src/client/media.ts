import { canEncodeAudio, getFirstEncodableVideoCodec, MediaStreamAudioTrackSource, MediaStreamVideoTrackSource, OggOutputFormat, Output, Quality, StreamTarget, WebMOutputFormat } from 'mediabunny'

export interface Chunk {
  data: Uint8Array<ArrayBuffer>
  position: number
}

export type Sink = (chunk: Chunk) => void

export interface Capture {
  ext: 'ogg' | 'webm' | 'mp4'
  stop(): Promise<void>
  failed: Promise<never>
}

const SPEECH = new Quality({ bitrate: 24_000 })

function target(sink: Sink): StreamTarget {
  return new StreamTarget(new WritableStream({ write: chunk => sink({ data: chunk.data, position: chunk.position }) }))
}

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

export async function captureVideo(track: MediaStreamTrack, sink: Sink): Promise<Capture | undefined> {
  const { width, height } = track.getSettings()
  const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8', 'av1'], { width, height }).catch(() => null)
  if (!codec) return undefined
  const clone = track.clone()
  const output = new Output({ format: new WebMOutputFormat({ minimumClusterDuration: 1 }), target: target(sink) })
  return withOutput(output, clone, new MediaStreamVideoTrackSource(clone as MediaStreamVideoTrack, { codec, quality: new Quality('medium') }), 'webm')
}
