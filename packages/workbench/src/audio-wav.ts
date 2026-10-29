/** A recording or an audio file as 16-bit mono WAV, with its length. */
export interface WavAudio { blob: Blob, seconds: number }

/**
 * Decodes any audio the browser plays (a microphone take in WebM, Ogg or MP4; an MP3, M4A or WAV file) and writes
 * it as 16-bit mono WAV at `rate`: the one format every voice-cloning provider takes. Rendering through an offline
 * context mixes the channels down and resamples, with no realtime audio and no permission.
 */
export async function toWav(source: Blob, rate = 24000): Promise<WavAudio> {
  const decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await source.arrayBuffer())
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
  const node = offline.createBufferSource()
  node.buffer = decoded
  node.connect(offline.destination)
  node.start()
  const samples = (await offline.startRendering()).getChannelData(0)
  const wav = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) wav.setUint8(at + i, value.charCodeAt(i)) }
  text(0, 'RIFF'); wav.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true)
  wav.setUint32(24, rate, true); wav.setUint32(28, rate * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true)
  text(36, 'data'); wav.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) wav.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), true)
  return { blob: new Blob([wav.buffer], { type: 'audio/wav' }), seconds: decoded.duration }
}
