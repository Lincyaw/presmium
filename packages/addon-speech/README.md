# @presmium/slidev-addon-speech

Speech services: speech synthesis and transcription through the operator's engines, the synthesis cache, and `presmium-speech`.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @presmium/slidev-addon-speech
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-speech'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The `SPEECH` service in Node and in the browser, with the cache `.presmium/speech/` (commit it, and others build without credentials).
- Speech is marked as AI generated in the player and in the audio's metadata; cloned voices need a recorded consent (`presmium-speech consent`).

## Configuration

The operator defines engines in environment variables: `PRESMIUM_SPEECH_<ID>_URL`, `_PROVIDER` and, optionally, `_KEY`. Documents name the engine's id only, for example `presmium: { presmium.speech: { engine: volcengine } }`.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0
