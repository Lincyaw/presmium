/** The lecture plugin's UI text (N-07), in Chinese and English, as a catalog of @presmium/host. */
import type { Locale } from '@presmium/kernel/contracts'

export interface LectureMessages {
  /** Name of the lecture view in the view menu. */
  view: string
  recorder: {
    region: string
    record: string
    rerecord: string
    stop: string
    camera: string
    screen: string
    track: string
    newTrack: string
    recording: (time: string) => string
    saving: string
    saved: (id: string) => string
    failed: (reason: string) => string
    unsupported: string
    laser: string
    marker: string
    clear: string
  }
  player: {
    region: string
    play: string
    pause: string
    seek: string
    time: (now: string, total: string) => string
    rate: string
    captions: string
    transcript: string
    chapters: string
    language: string
    tryIt: string
    back: string
    trying: string
    close: string
    synthetic: string
    /** The AI-generated label with the engine's provider (N-08). */
    syntheticBy: (provider: string) => string
    loading: string
    missing: (id: string) => string
    dropped: (count: number) => string
    jump: (time: string) => string
    step: (step: number) => string
  }
  list: {
    title: string
    empty: string
    unavailable: string
    open: (id: string) => string
  }
  /** Working on a recorded lecture's words (P-132, P-133); the engines' providers are named (N-08). */
  editor: {
    region: string
    transcribe: (provider: string) => string
    transcribeConfirm: (id: string, provider: string) => string
    transcribing: string
    transcribed: (count: number) => string
    voice: string
    synthesize: (provider: string) => string
    synthesizeConfirm: (provider: string, voice: string, count: number) => string
    synthesizing: string
    synthesized: string
    local: string
    confirm: string
    cancel: string
    edit: (id: string) => string
    save: string
    saving: string
    failed: (reason: string) => string
  }
}

export const LECTURE_MESSAGES: Record<Locale, LectureMessages> = {
  'zh-CN': {
    view: '讲授',
    recorder: {
      region: '讲授录制',
      record: '录制',
      rerecord: '重录本节',
      stop: '停止',
      camera: '摄像头',
      screen: '屏幕',
      track: '讲授',
      newTrack: '新讲授',
      recording: time => `录制中 ${time}`,
      saving: '正在保存…',
      saved: id => `已保存 ${id}`,
      failed: reason => `录制失败：${reason}`,
      unsupported: '这个浏览器不能录音',
      laser: '激光笔',
      marker: '荧光笔',
      clear: '清除标记',
    },
    player: {
      region: '讲授回放',
      play: '播放',
      pause: '暂停',
      seek: '进度',
      time: (now, total) => `${now} / ${total}`,
      rate: '倍速',
      captions: '字幕',
      transcript: '逐字稿',
      chapters: '章节',
      language: '字幕语言',
      tryIt: '我来试试',
      back: '回到讲授',
      trying: '你正在自行操作，讲授已暂停',
      close: '关闭讲授',
      synthetic: 'AI 合成语音',
      syntheticBy: provider => `AI 合成语音（${provider}）`,
      loading: '正在加载讲授…',
      missing: id => `找不到讲授 ${id}`,
      dropped: count => `讲义改动后有 ${count} 个操作失效，回放时略过`,
      jump: time => `跳到 ${time}`,
      step: step => `第 ${step} 步`,
    },
    list: {
      title: '讲授',
      empty: '这份讲义还没有讲授',
      unavailable: '读不到讲授列表',
      open: id => `播放讲授 ${id}`,
    },
    editor: {
      region: '讲授的文字与语音',
      transcribe: provider => `转写（${provider}）`,
      transcribeConfirm: (id, provider) => `把讲授 ${id} 的录音发给 ${provider} 转写？转写由该服务计费。`,
      transcribing: '正在转写…',
      transcribed: count => `已转写 ${count} 句`,
      voice: '音色',
      synthesize: provider => `重新合成（${provider}）`,
      synthesizeConfirm: (provider, voice, count) => `用 ${provider} 的音色“${voice}”重新合成这段讲授的 ${count} 句话？合成由该服务计费，结果由 AI 生成。`,
      synthesizing: '正在合成…',
      synthesized: '已重新合成',
      local: '本机，不外发',
      confirm: '确定',
      cancel: '取消',
      edit: id => `修改语音段 ${id}`,
      save: '保存',
      saving: '正在保存…',
      failed: reason => `失败：${reason}`,
    },
  },
  'en': {
    view: 'Lecture',
    recorder: {
      region: 'Lecture recording',
      record: 'Record',
      rerecord: 'Re-record section',
      stop: 'Stop',
      camera: 'Camera',
      screen: 'Screen',
      track: 'Lecture',
      newTrack: 'New lecture',
      recording: time => `Recording ${time}`,
      saving: 'Saving…',
      saved: id => `Saved ${id}`,
      failed: reason => `Recording failed: ${reason}`,
      unsupported: 'This browser cannot record audio',
      laser: 'Laser',
      marker: 'Marker',
      clear: 'Clear marks',
    },
    player: {
      region: 'Lecture playback',
      play: 'Play',
      pause: 'Pause',
      seek: 'Position',
      time: (now, total) => `${now} / ${total}`,
      rate: 'Speed',
      captions: 'Captions',
      transcript: 'Transcript',
      chapters: 'Chapters',
      language: 'Caption language',
      tryIt: 'Try it',
      back: 'Back to the lecture',
      trying: 'You are trying it yourself; the lecture is paused',
      close: 'Close the lecture',
      synthetic: 'AI-generated voice',
      syntheticBy: provider => `AI-generated voice (${provider})`,
      loading: 'Loading the lecture…',
      missing: id => `Lecture ${id} not found`,
      dropped: count => `${count} actions no longer match the deck and are skipped`,
      jump: time => `Go to ${time}`,
      step: step => `Step ${step}`,
    },
    list: {
      title: 'Lectures',
      empty: 'This deck has no lecture yet',
      unavailable: 'The lectures cannot be read',
      open: id => `Play lecture ${id}`,
    },
    editor: {
      region: 'Words and voice of the lecture',
      transcribe: provider => `Transcribe (${provider})`,
      transcribeConfirm: (id, provider) => `Send the audio of lecture ${id} to ${provider} for transcription? The service charges for it.`,
      transcribing: 'Transcribing…',
      transcribed: count => `Transcribed ${count} sentences`,
      voice: 'Voice',
      synthesize: provider => `Say again (${provider})`,
      synthesizeConfirm: (provider, voice, count) => `Say the ${count} sentences of this lecture again in the voice "${voice}" of ${provider}? The service charges for it; the result is AI-generated.`,
      synthesizing: 'Synthesizing…',
      synthesized: 'Said again',
      local: 'on this machine, nothing sent',
      confirm: 'OK',
      cancel: 'Cancel',
      edit: id => `Edit utterance ${id}`,
      save: 'Save',
      saving: 'Saving…',
      failed: reason => `Failed: ${reason}`,
    },
  },
}
