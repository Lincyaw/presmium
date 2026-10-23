# 录制与回放

用于录课、发布讲授回放、修改逐字稿、从讲解合成语音和导出视频。先决定是保留现场声音，还是根据讲义讲解合成讲授。

## 录制一遍

文稿列出 `@lincyaw/slidev-addon-lecture`；指针、聚光等重放还需引导插件。在文稿目录运行 `presmium dev --to web`，进入放映视图，用右上角录制栏开始。

按需要选择麦克风、摄像头和屏幕，允许浏览器相应权限。翻页、推进、聚光和标注随声音记录。停止后保存；离开放映视图也会结束录制。先录一小节并回放，确认声音和操作同步，再录完整讲授。

重录某节时选已有讲授，定位后选“重录本节”，离开该节即停止并替换它。给长期回放引用的章节与块写显式标签，避免改稿后无法定位。

文件在 `lectures/<id>/track.json` 与旁边的音视频目录。提交轨迹文件并单独保存媒体；音视频默认被忽略，只有轨迹不能恢复声音。

## 发布和检查回放

在头部 `renderers` 加 `lecture: {}`，然后：

```sh
presmium build --to web,lecture
```

保留 `dist/web/` 与 `dist/lecture/` 的相对位置，按 [发布、导出与离线](delivery.md) 服务整个站点。网页地址加 `?view=lecture&track=<ID>`，也可从“视图”选择讲授。分开部署时在头部写 `presmium: { presmium.lecture: { url: <回放资源地址> } }`。

验证声音、字幕、逐字稿跳转、章节定位和“我来试试”后返回讲授。改稿后运行 `presmium check`，处理 `presmium.lecture` 报告的失效引用；不能只因音频还能播放就认为回放有效。

## 用讲解合成讲授

文稿另列出 `@lincyaw/slidev-addon-speech`，在 `renderers.lecture.voice` 选择引擎与音色。语音引擎由运营者环境配置，凭据不写进文稿。例如：

```yaml
renderers:
  web: {}
  lecture:
    voice: { engine: volcengine, voice: zh_female_xiaohe_uranus_bigtts }
```

使用已有语音服务时沿用其引擎和音色。自定义引擎通过环境变量 `PRESMIUM_SPEECH_<ID>_URL`、`_PROVIDER` 与可选的 `_KEY` 定义；火山引擎可用 `PRESMIUM_SPEECH_VOLCENGINE_KEY`。只合成或只转写的引擎把另一项的模型写成 `none`（`_TRANSCRIBE_MODEL=none` 或 `_MODEL=none`），转写与合成就各自交给能做的引擎，文稿不必点名。确认目标服务与费用安排后再发起需要上传或计费的操作。

`presmium build --to web,lecture` 合成后用 `?view=lecture&track=script` 播放。合成片段保存在 `.presmium/speech/`，随 `speech.lock.json` 保存后，别人构建可沿用缓存。

讲解中 `{cue}` 安排聚光、推进与停顿，`{say}` 改读法；语法见作者技能的指令参考。写了音色却缺引擎或片段时，检查会指出缺少的句子；只想发布现场录制时不要额外配置合成音色。

## 改逐字稿、换声音或整理为讲义

在开发服务中回放录制，打开逐字稿。转写前核对录音将发给哪个服务；逐句修订后检查时间与操作绑定。选择音色重新合成会把文字交给语音服务，完成后回放确认。

把逐字稿整理为讲解或译文时，在工作台中让 agent 修改源码并审阅结果。录音是素材，最终讲义仍需由作者确认内容和结构。

## 导出视频

项目中需有 `playwright-chromium` 及浏览器；缺失时按错误提示安装。导出命令：

```sh
pnpm exec presmium-lecture export --track <ID> --out lecture.webm
```

默认 1280×720、30 fps，可用 `--size`、`--fps` 调整，输出 WebM。每种字幕语言成为视频中的一条字幕轨，也写在视频旁边（`lecture.zh-CN.vtt`）；`--burn zh-CN` 另把这种语言的字幕画进画面，给不能切换字幕的播放器。动画场景（`{scene}`）与光标按讲授的时刻逐帧画出，所以导出比讲授本身慢，几分钟的讲授要导出几分钟。导出后打开文件核对起止、声音、字幕与画面同步。合成声音在文件元数据中保留 AI 生成标识。
