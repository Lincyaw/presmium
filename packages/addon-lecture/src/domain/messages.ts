import type { Locale } from '@lincyaw/kernel/contracts'

export interface LectureMessages {
  view: string
  production: {
    missingSpeech: string
    cacheMissing(text: string, section: string, reason: string): string
    generateHint: string
    incompleteCache: string
    noVoice: string
    noPreparedLecture: string
  }
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
    playbackTimeout: string
    region: string
    play: string
    pause: string
    seek: string
    time: (now: string, total: string) => string
    rate: string
    captions: string
    transcript: string
    chapters: string
    sideTabs: string
    language: string
    close: string
    synthetic: string
    silent: string
    syntheticBy: (provider: string) => string
    loading: string
    failed: (reason: string) => string
    missing: (id: string) => string
    dropped: (count: number) => string
    unsaid: (count: number) => string
    stale: string
    jump: (time: string) => string
    step: (step: number) => string
  }
  list: {
    title: string
    empty: string
    unavailable: string
    open: (id: string) => string
  }
  editor: {
    region: string
    transcribe: (provider: string) => string
    transcribeConfirm: (id: string, provider: string, local: boolean) => string
    transcribing: string
    transcribed: (count: number) => string
    voice: string
    synthesize: (provider: string) => string
    synthesizeConfirm: (provider: string, voice: string, count: number, local: boolean) => string
    synthesizing: string
    synthesized: string
    local: string
    confirm: string
    cancel: string
    edit: (id: string) => string
    save: string
    saveSay: (provider: string) => string
    saveSayConfirm: (provider: string, local: boolean) => string
    saving: string
    failed: (reason: string) => string
  }
}

export const LECTURE_MESSAGES: Record<Locale, LectureMessages> = {
  'zh-CN': {
    view: '讲授',
    production: {
      missingSpeech: '读取配音缓存需要语音服务，请在 metadata.plugins 中启用 @lincyaw/addon-speech。',
      cacheMissing: (text, section, reason) => `页面 ${section} 的讲稿「${text}」没有匹配当前文字与音色的配音缓存：${reason}`,
      generateHint: '请先为当前讲稿和音色设置显式生成配音，再重新导出。检查和导出不会自动合成缺失音频。',
      incompleteCache: '当前讲稿与音色设置缺少完整的配音缓存。请先显式生成配音，再导出。',
      noVoice: '制作设置未指定 TTS 音色，当前文稿没有合成讲授轨。',
      noPreparedLecture: '文稿还没有可用讲授轨。请提供录制轨，或选择 TTS 音色并显式生成配音。',
    },
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
      playbackTimeout: '工作台未及时确认播放权限，请重试播放。',
      region: '讲授回放',
      play: '播放',
      pause: '暂停',
      seek: '进度',
      time: (now, total) => `${now} / ${total}`,
      rate: '倍速',
      captions: '字幕',
      transcript: '字幕列表',
      chapters: '章节',
      sideTabs: '字幕列表与章节',
      language: '字幕语言',
      close: '关闭讲授',
      synthetic: 'AI 合成语音',
      silent: '静音计划',
      syntheticBy: provider => `AI 合成语音（${provider}）`,
      loading: '正在加载讲授…',
      failed: reason => `讲授加载失败：${reason}`,
      missing: id => `找不到讲授 ${id}`,
      dropped: count => `讲义改动后有 ${count} 个操作失效，回放时略过`,
      unsaid: count => `有 ${count} 句还没能合成语音，按估计的时长静音播放，并显示字幕`,
      stale: '译文过期：原句在翻译之后改过',
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
      transcribeConfirm: (id, provider, local) => (local ? `用 ${provider} 转写讲授 ${id} 的录音？` : `把讲授 ${id} 的录音发给 ${provider} 转写？转写由该服务计费。`),
      transcribing: '正在转写…',
      transcribed: count => `已转写 ${count} 句`,
      voice: '音色',
      synthesize: provider => `重新合成（${provider}）`,
      synthesizeConfirm: (provider, voice, count, local) => `用 ${provider} 的音色“${voice}”重新合成这段讲授的 ${count} 句话？${local ? '' : '合成由该服务计费，'}结果由 AI 生成。`,
      synthesizing: '正在合成…',
      synthesized: '已重新合成',
      local: '本机，不外发',
      confirm: '确定',
      cancel: '取消',
      edit: id => `修改语音段 ${id}`,
      save: '保存',
      saveSay: provider => `保存并重新合成（${provider}）`,
      saveSayConfirm: (provider, local) => (local ? `用 ${provider} 重新合成改过的这句话？结果由 AI 生成。` : `把改过的这句话发给 ${provider} 重新合成？合成由该服务计费，结果由 AI 生成。`),
      saving: '正在保存…',
      failed: reason => `失败：${reason}`,
    },
  },
  'en': {
    view: 'Lecture',
    production: {
      missingSpeech: 'Production voiceover needs the speech service to read its exact audio cache; add @lincyaw/addon-speech to metadata.plugins.',
      cacheMissing: (text, section, reason) => `The script "${text}" (section ${section}) has no voiceover cache matching its current text and voice: ${reason}`,
      generateHint: 'Generate voiceover explicitly for the current script and voice settings, then export again. Checking and exporting never synthesize missing audio.',
      incompleteCache: 'The current script and voice settings have no complete cached voiceover. Generate voiceover explicitly before exporting.',
      noVoice: 'Production voiceSource names no TTS voice: the document has no synthesized lecture.',
      noPreparedLecture: 'The document has no prepared lecture. Provide a recording, or choose a TTS voice and explicitly generate its voiceover first.',
    },
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
      playbackTimeout: 'The workbench did not acknowledge playback. Try playing again.',
      region: 'Lecture playback',
      play: 'Play',
      pause: 'Pause',
      seek: 'Position',
      time: (now, total) => `${now} / ${total}`,
      rate: 'Speed',
      captions: 'Captions',
      transcript: 'Caption list',
      chapters: 'Chapters',
      sideTabs: 'Captions and chapters',
      language: 'Caption language',
      close: 'Close the lecture',
      synthetic: 'AI-generated voice',
      silent: 'Silent plan',
      syntheticBy: provider => `AI-generated voice (${provider})`,
      loading: 'Loading the lecture…',
      failed: reason => `Lecture could not be loaded: ${reason}`,
      missing: id => `Lecture ${id} not found`,
      dropped: count => `${count} actions no longer match the deck and are skipped`,
      unsaid: count => `${count} sentences could not be said yet: they play silent for about the time they take, with their captions`,
      stale: 'Outdated translation: the sentence changed after it was translated',
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
      transcribeConfirm: (id, provider, local) => (local ? `Transcribe the audio of lecture ${id} with ${provider}?` : `Send the audio of lecture ${id} to ${provider} for transcription? The service charges for it.`),
      transcribing: 'Transcribing…',
      transcribed: count => `Transcribed ${count} sentences`,
      voice: 'Voice',
      synthesize: provider => `Say again (${provider})`,
      synthesizeConfirm: (provider, voice, count, local) => `Say the ${count} sentences of this lecture again in the voice "${voice}" of ${provider}? ${local ? 'The' : 'The service charges for it; the'} result is AI-generated.`,
      synthesizing: 'Synthesizing…',
      synthesized: 'Said again',
      local: 'on this machine, nothing sent',
      confirm: 'OK',
      cancel: 'Cancel',
      edit: id => `Edit utterance ${id}`,
      save: 'Save',
      saveSay: provider => `Save and say again (${provider})`,
      saveSayConfirm: (provider, local) => (local ? `Say the corrected sentence again with ${provider}? The result is AI-generated.` : `Send the corrected sentence to ${provider} to say it again? The service charges for it; the result is AI-generated.`),
      saving: 'Saving…',
      failed: reason => `Failed: ${reason}`,
    },
  },
}
