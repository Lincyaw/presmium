import type { Locale } from '@lincyaw/kernel/contracts'

export interface LectureMessages {
  view: string
  production: {
    missingSpeech: string
    /** Sentences without a usable voiceover, counted once per reason with the pages they are on. */
    cacheMissing(count: number, pages: readonly string[], reason: string): string
    generateHint: string
    incompleteCache: string
    noVoice: string
    noPreparedLecture: string
    /** Why a sentence has no voiceover, by the code a speech service or the plan gives; others read as `reasonGeneric`. */
    reasons: Record<string, string>
    reasonGeneric: string
  }
  /** The lecture's length: the check against `maximumDurationMs` and the report of `presmium-lecture timing`. */
  timing: {
    /** The planned video is longer than the limit; `cut` is about how much script to remove at the measured rate. */
    tooLong(length: string, limit: string, overSeconds: string, cut?: { rate: string, characters: number }): string
    limitInvalid: string
    /** The length could not be checked against the limit; `reason` is a sentence of this catalog. */
    unchecked(reason: string): string
    uncheckedReason: string
    uncheckedEstimated: string
    uncheckedUnknown: string
    columns: { page: string, step: string, characters: string, voice: string, rate: string, animation: string, length: string }
    totals(steps: number, characters: number, voiceSeconds: string, rate?: string): string
    /** The video's length, then `verdict` (`within` or `over`) when the document sets a limit. */
    video(length: string, seconds: string, verdict?: string): string
    within(limit: string): string
    over(limit: string, overSeconds: string, characters?: number): string
    estimated: string
    unknown: string
  }
  /** The image `presmium-lecture export --contact-sheet` writes: a frame of every step, taken from the video. */
  sheet: {
    /** A frame's label, written into the image in the document's language. */
    frame(page: number, step: number, title: string | undefined, at: string): string
    written(file: string, frames: number): string
    needsFfmpeg(file: string, install: string): string
    /** Every step of the video is shorter than `seconds`, the shortest step the sheet takes frames of. */
    noFrames(file: string, seconds: number): string
    unlabelled(file: string): string
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

/** The pages named in one message: the first three, then a word that more follow. */
function pageList(pages: readonly string[], separator: string, more: string): string {
  const shown = pages.slice(0, 3).join(separator)
  return pages.length > 3 ? `${shown}${separator === '、' ? '' : ' '}${more}` : shown
}

/** Sentences without a usable voiceover, one entry per reason: how many, the pages they are on and where the first one is. */
export function missingVoiceover<S>(missing: readonly { section: string, reason: string, source?: S }[]): { reason: string, count: number, pages: string[], source?: S }[] {
  const groups = new Map<string, { reason: string, count: number, pages: string[], source?: S }>()
  for (const item of missing) {
    let group = groups.get(item.reason)
    if (!group) groups.set(item.reason, group = { reason: item.reason, count: 0, pages: [], ...item.source ? { source: item.source } : {} })
    group.count++
    if (!group.pages.includes(item.section)) group.pages.push(item.section)
  }
  return [...groups.values()]
}

export const LECTURE_MESSAGES: Record<Locale, LectureMessages> = {
  'zh-CN': {
    view: '讲授',
    production: {
      missingSpeech: '读取已生成的配音需要语音服务。请在文稿的 metadata.plugins 中启用语音服务插件 addon-speech。',
      cacheMissing: (count, pages, reason) => `${count} 句讲稿没有与当前文字和音色一致的配音（页面 ${pageList(pages, '、', '等')}）。${reason}`,
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
    timing: {
      tooLong: (length, limit, over, cut) => `讲授视频长 ${length}，比上限 ${limit} 长 ${over} 秒。${cut ? `按配音的实测语速（每秒 ${cut.rate} 字），约需删去讲稿 ${cut.characters} 字。` : ''}`,
      limitInvalid: 'metadata.renderers.lecture.maximumDurationMs 须为大于 0 的毫秒数。',
      unchecked: reason => `无法检查讲授视频是否超过时长上限。${reason}`,
      uncheckedReason: '读取配音或音频文件失败。请重新运行 presmium check。',
      uncheckedEstimated: '部分讲稿还没有配音或没有选择音色，视频时长只是估算；生成配音后再检查。',
      uncheckedUnknown: '有步骤的时长无法确定，原因见这次检查的其他问题。',
      columns: { page: '页面', step: '步骤', characters: '字数', voice: '配音（秒）', rate: '每秒字数', animation: '动画（秒）', length: '时长（秒）' },
      totals: (steps, characters, voice, rate) => `共 ${steps} 步，讲稿 ${characters} 字，配音 ${voice} 秒${rate ? `（每秒 ${rate} 字）` : ''}。`,
      video: (length, seconds, verdict) => `视频长 ${length}（${seconds} 秒）。${verdict ?? ''}`,
      within: limit => `未超过上限 ${limit}。`,
      over: (limit, over, characters) => `比上限 ${limit} 长 ${over} 秒${characters ? `，约需删去讲稿 ${characters} 字` : ''}。`,
      estimated: '部分讲稿还没有配音，以下时长含估算。请先生成配音。',
      unknown: '有步骤的时长无法确定。请运行 presmium check 查看原因。',
    },
    sheet: {
      frame: (page, step, title, at) => `第 ${page} 页 · 第 ${step} 步${title ? ` · ${title}` : ''} · ${at}`,
      written: (file, frames) => `已写入 ${file}：${frames} 帧，每步起点后 0.3 秒与中点各一帧。`,
      needsFfmpeg: (file, install) => `无法写入 ${file}：从视频中截取画面需要 FFmpeg。请安装 FFmpeg（${install}）。`,
      noFrames: (file, seconds) => `无法写入 ${file}：视频中每一步都短于 ${seconds} 秒，没有可截取的画面。`,
      unlabelled: file => `${file} 中的画面没有标注页面与步骤：这个 FFmpeg 没有 libass（ass 滤镜）。`,
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
      cacheMissing: (count, pages, reason) => `${count} sentence${count === 1 ? '' : 's'} of the script ${count === 1 ? 'has' : 'have'} no voiceover that matches the current text and voice (page${pages.length === 1 ? '' : 's'} ${pageList(pages, ', ', 'and more')}). ${reason}`,
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
    timing: {
      tooLong: (length, limit, over, cut) => `The lecture video is ${length} long, ${over} s over its limit of ${limit}.${cut ? ` At the voiceover’s measured rate of ${cut.rate} characters a second, cut about ${cut.characters} characters of the script.` : ''}`,
      limitInvalid: 'metadata.renderers.lecture.maximumDurationMs must be a number of milliseconds greater than 0.',
      unchecked: reason => `Couldn’t check the lecture video’s length against its limit. ${reason}`,
      uncheckedReason: 'Reading the voiceover or audio files failed. Run presmium check again.',
      uncheckedEstimated: 'Some of the script has no voiceover or no voice is chosen, so the video’s length is only an estimate. Check again once the voiceover is generated.',
      uncheckedUnknown: 'Some steps have no known length; the other problems of this check say why.',
      columns: { page: 'Page', step: 'Step', characters: 'Characters', voice: 'Voiceover (s)', rate: 'Characters/s', animation: 'Animation (s)', length: 'Length (s)' },
      totals: (steps, characters, voice, rate) => `${steps} step${steps === 1 ? '' : 's'}, ${characters} character${characters === 1 ? '' : 's'} of script, ${voice} s of voiceover${rate ? ` (${rate} characters a second)` : ''}.`,
      video: (length, seconds, verdict) => `The video is ${length} long (${seconds} s).${verdict ? ` ${verdict}` : ''}`,
      within: limit => `It is within the limit of ${limit}.`,
      over: (limit, over, characters) => `It is ${over} s over the limit of ${limit}${characters ? `; cut about ${characters} characters of the script` : ''}.`,
      estimated: 'Some of the script has no voiceover yet, so these lengths are partly estimated. Generate the voiceover first.',
      unknown: 'Some steps have no known length. Run presmium check to see why.',
    },
    sheet: {
      frame: (page, step, title, at) => `Page ${page} · Step ${step}${title ? ` · ${title}` : ''} · ${at}`,
      written: (file, frames) => `Wrote ${file}: ${frames} frames, each step 0.3 s after it starts and at its middle.`,
      needsFfmpeg: (file, install) => `Couldn’t write ${file}: taking frames from the video needs FFmpeg. Install FFmpeg (${install}).`,
      noFrames: (file, seconds) => `Couldn’t write ${file}: every step of the video is shorter than ${seconds} s, so there are no frames to take.`,
      unlabelled: file => `The frames in ${file} have no page and step labels: this FFmpeg has no libass (ass filter).`,
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
