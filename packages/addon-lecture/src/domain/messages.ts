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
    /** A reader opens the synthesized lecture before an editor had it made (synthesis is paid). */
    notYet: string
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
    /** Saving a sentence of a synthetic voice says it again: the button and its confirmation name the provider. */
    saveSay: (provider: string) => string
    saveSayConfirm: (provider: string) => string
    saving: string
    failed: (reason: string) => string
  }
  /** Writing a recorded lecture back through the assistant's change tasks (P-136, P-137); the model's provider is named (N-08). */
  writeback: {
    toggle: string
    title: string
    close: string
    intro: string
    provider: (provider: string) => string
    unavailable: string
    empty: string
    lecture: (id: string, count: number) => string
    untranscribed: string
    narrate: string
    translate: string
    language: string
    narrateLabel: (id: string) => string
    translateLabel: (id: string, language: string) => string
    task: string
    working: string
    tool: (name: string) => string
    steps: (count: number) => string
    cancel: string
    review: (engine: string) => string
    binary: string
    accept: string
    reject: string
    committed: (revision: string) => string
    rejected: string
    nothing: string
    revert: string
    reverted: (revision: string) => string
    conflicts: (files: string[]) => string
    failed: (reason: string) => string
    /** The request of the `transcript` task: the transcript as narration, written back by section, the cues kept. */
    narrateRequest: (id: string) => string
    /** The request of the `chat` task; its first line is the commit's subject. */
    translateRequest: (id: string, language: string, lang: string) => string
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
      notYet: '这段由讲解合成的讲授还没有生成：合成要计费，所以编辑者打开它时才合成，请稍后再来',
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
      saveSay: provider => `保存并重新合成（${provider}）`,
      saveSayConfirm: provider => `把改过的这句话发给 ${provider} 重新合成？合成由该服务计费，结果由 AI 生成。`,
      saving: '正在保存…',
      failed: reason => `失败：${reason}`,
    },
    writeback: {
      toggle: '讲授回写',
      title: '讲授回写',
      close: '关闭',
      intro: '把录制讲授的转写交给 agent：整理为讲解写回讲义，或为语音段生成译文。改动先逐个文件审阅，接受后形成一个提交，可以撤销。',
      provider: provider => `修改由 ${provider} 的模型完成`,
      unavailable: '这里不能交给 agent 修改：要在工作区服务中以编辑者身份打开，并由运营者配置 agent',
      empty: '这份讲义还没有录制的讲授',
      lecture: (id, count) => `讲授 ${id}（${count} 句）`,
      untranscribed: '还没有转写：先在回放的逐字稿中转写',
      narrate: '整理为讲解',
      translate: '生成译文',
      language: '译文语言',
      narrateLabel: id => `整理为讲解：讲授 ${id}`,
      translateLabel: (id, language) => `生成${language}译文：讲授 ${id}`,
      task: '回写任务',
      working: 'agent 正在处理…',
      tool: name => `agent 正在使用 ${name}…`,
      steps: count => `已记下 ${count} 步`,
      cancel: '取消',
      review: engine => `审阅改动（${engine}）`,
      binary: '二进制文件',
      accept: '接受',
      reject: '全部拒绝',
      committed: revision => `已提交 ${revision.slice(0, 7)}`,
      rejected: '已拒绝，没有提交',
      nothing: 'agent 没有改动任何文件',
      revert: '撤销这次修改',
      reverted: revision => `已撤销（${revision.slice(0, 7)}）`,
      conflicts: files => `撤销与之后的修改冲突：${files.join('、')}`,
      failed: reason => `失败：${reason}`,
      narrateRequest: id => [
        `把讲授 ${id} 的转写按章节整理为讲解，写回讲义的源码。`,
        `1. 调用 Presmium 的 MCP 工具 track_narration，参数 {"track": "${id}"}（服务多份文档时另加上下文中的 document）。它按章节与步骤给出由逐字稿拼成的讲解草稿 draft：讲授中的操作（聚光、指针、推进一步……）发生时说到的那个字之前，已写好对应的提示标记 {cue …}\`…\`；还给出每一步现有讲解在源码中的位置 narration（文件与行），一步没有讲解时给出这一步显示的上屏块 after。`,
        '2. 逐步整理草稿：去掉口头禅、重复与口误，补全标点，不改变语言与意思；每个提示标记原样保留，留在原来的两个字之间。',
        '3. 用整理后的文字替换这一步现有的讲解段落；一步没有讲解时，把它作为一段新的讲解写在 after 那个块之后。只改讲解，不改上屏内容（代码块、{slide} 等）与文稿头部。',
      ].join('\n'),
      translateRequest: (id, language, lang) => [
        `为讲授 ${id} 生成${language}译文（${lang}）`,
        `1. 调用 Presmium 的 MCP 工具 track_translations，参数 {"track": "${id}", "lang": "${lang}"}（服务多份文档时另加上下文中的 document）。它列出每个语音段的 id、原文 text 与原文的摘要 source。`,
        `2. 把每个语音段译成${language}，写进 lectures/${id}/track.json 中这个语音段的 "translations"："${lang}": { "text": "<译文>", "source": "<工具给出的 source>" }。已有且没有过期的译文可以保留。`,
        '3. track.json 保持每个语音段一行的写法；只改 translations，不改别的字段与别的文件。',
      ].join('\n'),
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
      notYet: 'This lecture synthesized from the narration has not been made yet: synthesis is paid, so it is made when an editor opens it. Come back later',
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
      saveSay: provider => `Save and say again (${provider})`,
      saveSayConfirm: provider => `Send the corrected sentence to ${provider} to say it again? The service charges for it; the result is AI-generated.`,
      saving: 'Saving…',
      failed: reason => `Failed: ${reason}`,
    },
    writeback: {
      toggle: 'Lecture write-back',
      title: 'Lecture write-back',
      close: 'Close',
      intro: 'Give the transcript of a recorded lecture to the agent: tidied into the narration of the deck, or translated. You review the changes file by file; accepted, they are one commit you can undo.',
      provider: provider => `Changes are made by a model of ${provider}`,
      unavailable: 'The agent cannot change the deck here: open it in the workspace server as an editor, with an agent the operator configured',
      empty: 'This deck has no recorded lecture yet',
      lecture: (id, count) => `Lecture ${id} (${count} sentences)`,
      untranscribed: 'Not transcribed yet: transcribe it in the transcript of the player first',
      narrate: 'Narration from the transcript',
      translate: 'Translate',
      language: 'Language',
      narrateLabel: id => `Narration from the transcript: lecture ${id}`,
      translateLabel: (id, language) => `${language} translation: lecture ${id}`,
      task: 'Write-back task',
      working: 'The agent is working…',
      tool: name => `The agent is using ${name}…`,
      steps: count => `${count} steps recorded`,
      cancel: 'Cancel',
      review: engine => `Review the changes (${engine})`,
      binary: 'Binary file',
      accept: 'Accept',
      reject: 'Reject all',
      committed: revision => `Committed ${revision.slice(0, 7)}`,
      rejected: 'Rejected; nothing committed',
      nothing: 'The agent changed no file',
      revert: 'Undo this change',
      reverted: revision => `Undone (${revision.slice(0, 7)})`,
      conflicts: files => `The undo conflicts with later changes: ${files.join(', ')}`,
      failed: reason => `Failed: ${reason}`,
      narrateRequest: id => [
        `Write the transcript of lecture ${id} back into the deck's source as its narration, section by section.`,
        `1. Call the Presmium MCP tool track_narration with {"track": "${id}"} (and the context's document when several documents are served). Per section and step it gives a draft of the narration made of the transcript: before the word said when an action of the lecture happened (a spotlight, the pointer, the next step …) it has the cue role for it, {cue …}\`…\`. It also gives where each step's narration is in the source (narration: file and lines), and for a step without narration the on-screen block shown at that step (after).`,
        '2. Tidy each step\'s draft: drop fillers, repetitions and slips, complete the punctuation, keep the language and the meaning; keep every cue role as it is, between the same two words.',
        '3. Replace the step\'s narration paragraphs with the tidied text; for a step without narration, write it as a new paragraph after the block of after. Change the narration only, not what is on screen (code blocks, {slide} …) or the headmatter.',
      ].join('\n'),
      translateRequest: (id, language, lang) => [
        `Translate lecture ${id} into ${language} (${lang})`,
        `1. Call the Presmium MCP tool track_translations with {"track": "${id}", "lang": "${lang}"} (and the context's document when several documents are served). It lists each utterance's id, its text and source, the digest of the text.`,
        `2. Translate each utterance into ${language} and write it into the utterance's "translations" in lectures/${id}/track.json: "${lang}": { "text": "<translation>", "source": "<the source the tool gave>" }. Translations that are there and not stale may stay.`,
        '3. Keep track.json one utterance a line; change the translations only, no other field and no other file.',
      ].join('\n'),
    },
  },
}
