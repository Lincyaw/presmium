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
    /** Why a sentence has no voiceover, by the code a speech service or the plan gives; others read as `reasonGeneric`. */
    reasons: Record<string, string>
    reasonGeneric: string
  }
  /** The problems of a {cue} mark, written into the document's diagnostics. */
  cue: {
    problem(command: string, reason: string): string
    unknown(name: string, commands: readonly string[]): string
    pauseDuration(arg: string): string
    clickAction: string
    markName: string
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
    more: string
    presenter: string
    previous: string
    next: string
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

/** What the lecture's tools say to the AI and the author for the codes they fail with (the AI may pass it on). */
export const LECTURE_TOOL_ERRORS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    'lecture-plugin-missing': '这份文稿没有启用讲授插件。',
    'document-not-ready': '文稿还没有准备好，请稍后重试。',
    'speech-unavailable': '未连接语音服务。请在文稿中启用语音服务插件 addon-speech。',
    'track-required': '需要给出讲授的名称（track）。',
    'lang-required': '需要给出要译成的语言（lang）。',
  },
  en: {
    'lecture-plugin-missing': 'This document doesn’t use the lecture plugin.',
    'document-not-ready': 'The document isn’t ready yet. Try again shortly.',
    'speech-unavailable': 'No voice service is connected. Enable the voice service plugin addon-speech in the document.',
    'track-required': 'Give the name of the lecture (track).',
    'lang-required': 'Give the language to translate into (lang).',
  },
}

export const LECTURE_MESSAGES: Record<Locale, LectureMessages> = {
  'zh-CN': {
    view: '讲授',
    production: {
      missingSpeech: '读取已生成的配音需要语音服务。请在文稿的 metadata.plugins 中启用语音服务插件 addon-speech。',
      cacheMissing: (text, section, reason) => `页面 ${section} 的讲稿“${text}”没有与当前文字和音色一致的配音。${reason}`,
      generateHint: '请先为当前讲稿和音色生成配音，再重新导出。检查和导出不会自动生成缺失的配音。',
      incompleteCache: '当前讲稿与音色的配音不完整。请先生成配音，再导出。',
      noVoice: '视频制作设置未指定音色，文稿没有生成的配音。',
      noPreparedLecture: '文稿还没有可用的配音。请提供录音，或选择音色并生成配音。',
      reasons: {
        'voiceover-not-generated': '还没有为当前讲稿和音色生成配音。',
        'voiceover-cache-missing': '语音服务没有给出已生成配音的文件。',
        'speech-unavailable': '未连接语音服务。',
        'voice-unset': '没有选择音色。',
        'voice-step-binding-unavailable': '这句讲稿所在的步骤已经变化，请重新选择音色。',
        'production-media-changed': '配音文件在读取时发生了变化，请重试。',
      },
      reasonGeneric: '无法读取这句讲稿的配音。',
    },
    cue: {
      problem: (command, reason) => `提示“${command}”：${reason}`,
      unknown: (name, commands) => `没有“${name}”这种提示。可用的提示：${commands.join('、')}。`,
      pauseDuration: arg => `停顿需要时长，例如“pause 800ms”，而不是“${arg}”。`,
      clickAction: '点击需要组件的操作名，例如“click reset”。',
      markName: '标记需要名称，例如“mark merge”。',
    },
    recorder: {
      region: '讲授录制',
      record: '录制',
      rerecord: '重录本页',
      stop: '停止',
      camera: '摄像头',
      screen: '屏幕',
      track: '讲授',
      newTrack: '新建讲授',
      recording: time => `正在录制 ${time}`,
      saving: '正在保存…',
      saved: id => `已保存 ${id}`,
      failed: reason => `录制失败：${reason}`,
      unsupported: '此浏览器无法录音',
      laser: '激光笔',
      marker: '荧光笔',
      clear: '清除标记',
    },
    player: {
      playbackTimeout: '无法开始播放。请重试。',
      region: '讲授回放',
      play: '播放',
      pause: '暂停',
      seek: '进度',
      time: (now, total) => `${now} / ${total}`,
      rate: '倍速',
      more: '更多播放选项',
      presenter: '演示者视图',
      previous: '上一步',
      next: '下一步',
      captions: '字幕',
      transcript: '字幕列表',
      chapters: '章节',
      sideTabs: '字幕列表与章节',
      language: '字幕语言',
      close: '关闭讲授',
      synthetic: 'AI 生成的配音',
      silent: '无声播放',
      syntheticBy: provider => `AI 生成的配音（${provider}）`,
      loading: '正在加载讲授…',
      failed: reason => `无法加载讲授：${reason}`,
      missing: id => `找不到讲授 ${id}`,
      dropped: count => `文稿改动后有 ${count} 个操作失效，回放时略过`,
      unsaid: count => `有 ${count} 句尚未生成配音，按估计的时长无声播放并显示字幕`,
      stale: '译文需要更新：原句在翻译之后有改动',
      jump: time => `跳到 ${time}`,
      step: step => `第 ${step} 步`,
    },
    list: {
      title: '讲授',
      empty: '这份文稿还没有讲授',
      unavailable: '无法读取讲授列表',
      open: id => `播放讲授 ${id}`,
    },
    editor: {
      region: '讲授的讲稿与配音',
      transcribe: provider => `转写（${provider}）`,
      transcribeConfirm: (id, provider, local) => (local ? `用 ${provider} 转写讲授 ${id} 的录音？` : `把讲授 ${id} 的录音发给 ${provider} 转写？转写由该服务计费。`),
      transcribing: '正在转写…',
      transcribed: count => `已转写 ${count} 句`,
      voice: '音色',
      synthesize: provider => `重新生成配音（${provider}）`,
      synthesizeConfirm: (provider, voice, count, local) => `用 ${provider} 的音色“${voice}”为这段讲授的 ${count} 句话重新生成配音？${local ? '' : '生成由该服务计费，'}结果由 AI 生成。`,
      synthesizing: '正在生成…',
      synthesized: '已重新生成',
      local: '本机，不外发',
      confirm: '确定',
      cancel: '取消',
      edit: id => `编辑语句 ${id}`,
      save: '保存',
      saveSay: provider => `保存并重新生成配音（${provider}）`,
      saveSayConfirm: (provider, local) => (local ? `用 ${provider} 为改过的这句话重新生成配音？结果由 AI 生成。` : `把改过的这句话发给 ${provider} 重新生成配音？生成由该服务计费，结果由 AI 生成。`),
      saving: '正在保存…',
      failed: reason => `无法完成：${reason}`,
    },
  },
  'en': {
    view: 'Lecture',
    production: {
      missingSpeech: 'Reading the generated voiceover needs the voice service. Enable the voice service plugin addon-speech in the document’s metadata.plugins.',
      cacheMissing: (text, section, reason) => `The script “${text}” on page ${section} has no voiceover that matches its current text and voice. ${reason}`,
      generateHint: 'Generate the voiceover for the current script and voice first, then export again. Checking and exporting never generate missing voiceover.',
      incompleteCache: 'The voiceover for the current script and voice is incomplete. Generate the voiceover before exporting.',
      noVoice: 'The video production settings name no voice, so the document has no generated voiceover.',
      noPreparedLecture: 'The document has no voiceover yet. Provide a recording, or choose a voice and generate the voiceover first.',
      reasons: {
        'voiceover-not-generated': 'No voiceover is generated for the current script and voice yet.',
        'voiceover-cache-missing': 'The voice service gave no file for the generated voiceover.',
        'speech-unavailable': 'No voice service is connected.',
        'voice-unset': 'No voice is chosen.',
        'voice-step-binding-unavailable': 'The step of this sentence changed. Choose its voice again.',
        'production-media-changed': 'The voiceover file changed while it was read. Try again.',
      },
      reasonGeneric: 'Couldn’t read the voiceover of this sentence.',
    },
    cue: {
      problem: (command, reason) => `Cue “${command}”: ${reason}`,
      unknown: (name, commands) => `There is no cue “${name}”. The cues are ${commands.join(', ')}.`,
      pauseDuration: arg => `A pause needs a duration, such as “pause 800ms”, not “${arg}”.`,
      clickAction: 'A click needs the action of the component, such as “click reset”.',
      markName: 'A mark needs a name, such as “mark merge”.',
    },
    recorder: {
      region: 'Lecture Recording',
      record: 'Record',
      rerecord: 'Re-record Page',
      stop: 'Stop',
      camera: 'Camera',
      screen: 'Screen',
      track: 'Lecture',
      newTrack: 'New Lecture',
      recording: time => `Recording ${time}`,
      saving: 'Saving…',
      saved: id => `Saved ${id}`,
      failed: reason => `Recording failed: ${reason}`,
      unsupported: 'This browser can’t record audio',
      laser: 'Laser',
      marker: 'Marker',
      clear: 'Clear Marks',
    },
    player: {
      playbackTimeout: 'Couldn’t start playback. Please try again.',
      region: 'Lecture Playback',
      play: 'Play',
      pause: 'Pause',
      seek: 'Position',
      time: (now, total) => `${now} / ${total}`,
      rate: 'Speed',
      more: 'More Playback Options',
      presenter: 'Presenter View',
      previous: 'Previous Step',
      next: 'Next Step',
      captions: 'Captions',
      transcript: 'Caption List',
      chapters: 'Chapters',
      sideTabs: 'Caption list and chapters',
      language: 'Caption language',
      close: 'Close Lecture',
      synthetic: 'AI-generated voiceover',
      silent: 'Silent playback',
      syntheticBy: provider => `AI-generated voiceover (${provider})`,
      loading: 'Loading the lecture…',
      failed: reason => `Couldn’t load the lecture: ${reason}`,
      missing: id => `Lecture ${id} not found`,
      dropped: count => `${count} actions no longer match the document and are skipped`,
      unsaid: count => `${count} sentences have no voiceover yet; they play silently for their estimated length, with captions`,
      stale: 'Translation update needed: the sentence changed after it was translated',
      jump: time => `Go to ${time}`,
      step: step => `Step ${step}`,
    },
    list: {
      title: 'Lectures',
      empty: 'This document has no lecture yet',
      unavailable: 'Couldn’t read the lectures',
      open: id => `Play Lecture ${id}`,
    },
    editor: {
      region: 'Lecture Script and Voiceover',
      transcribe: provider => `Transcribe (${provider})`,
      transcribeConfirm: (id, provider, local) => (local ? `Transcribe the audio of lecture ${id} with ${provider}?` : `Send the audio of lecture ${id} to ${provider} for transcription? The service charges for it.`),
      transcribing: 'Transcribing…',
      transcribed: count => `Transcribed ${count} sentences`,
      voice: 'Voice',
      synthesize: provider => `Regenerate Voiceover (${provider})`,
      synthesizeConfirm: (provider, voice, count, local) => `Regenerate the voiceover for the ${count} sentences of this lecture in the voice “${voice}” of ${provider}? ${local ? 'The' : 'The service charges for it; the'} result is AI-generated.`,
      synthesizing: 'Generating…',
      synthesized: 'Regenerated',
      local: 'On this machine; nothing is sent',
      confirm: 'OK',
      cancel: 'Cancel',
      edit: id => `Edit Sentence ${id}`,
      save: 'Save',
      saveSay: provider => `Save and Regenerate Voiceover (${provider})`,
      saveSayConfirm: (provider, local) => (local ? `Regenerate the voiceover for the corrected sentence with ${provider}? The result is AI-generated.` : `Send the corrected sentence to ${provider} to regenerate its voiceover? The service charges for it; the result is AI-generated.`),
      saving: 'Saving…',
      failed: reason => `Couldn’t finish: ${reason}`,
    },
  },
}
