# @lincyaw/addon-speech

Speech services: speech synthesis and transcription through the operator's engines, the synthesis cache, and `presmium-speech`.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-speech
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- The `SPEECH` service in Node and in the browser, with the cache `.presmium/speech/` (commit it, and others build without credentials).
- Speech is marked as AI generated in the player and in the audio's metadata; cloned voices need a recorded consent (`presmium-speech consent`).

## Configuration

In Studio, open **Settings → Voice Service**, enter the API key from the Volcengine speech console and save. Volcengine speech synthesis 2.0 is the default. The same page is linked from Video Production → Voiceover. Saved credentials apply to the next operation without restarting Studio; choose a voice and explicitly preview or generate it afterwards. **Check Configuration** checks saved local settings, not provider authentication or billing permissions.

The key is stored with mode 0600 in `<operatorDir>/speech/credentials.json`, outside the workspace and document. The owner-only route uses the existing workspace authorization. Reads return configuration status without the key; clearing the saved key restores the environment fallback. Concurrent changes use a revision check under a filesystem lock. Explicit compiler secret resolvers keep precedence.

The operator defines engines in environment variables: `PRESMIUM_SPEECH_<ID>_URL`, `_PROVIDER` and, optionally, `_KEY`. Documents name the engine's id only, for example `presmium: { presmium.speech: { engine: volcengine } }`.

Volcengine (engine id `volcengine`) needs only `PRESMIUM_SPEECH_VOLCENGINE_KEY`, the API key from its speech console; it synthesizes with speech synthesis 2.0 (`seed-tts-2.0`). Its voice list is bundled with the package. With the account's IAM access key pair, `PRESMIUM_SPEECH_VOLCENGINE_ACCESS_KEY_ID` and `PRESMIUM_SPEECH_VOLCENGINE_SECRET_ACCESS_KEY` (and `PRESMIUM_SPEECH_VOLCENGINE_PROJECT`, by default `default`), the list comes from the account through Volcengine's SDK, together with the account's cloned voices.

Cloned voices stay off until the operator sets `settings.presmium.speech.cloned: true` in `presmium.workspace.yaml`. Then the workbench trains one from its voice dialog (Clone a voice…), and so does `presmium-speech clone <engine> <voice> <sample> --speaker … --scope … --statement <recording>`: both register the speaker's consent before the sample leaves the machine. The provider charges for training and for every synthesis; a pay-as-you-go Volcengine voice is charged at its first synthesis, previews included.

Engine URLs must be HTTP(S) addresses without user information, a query or a fragment; credentials belong in `_KEY`. New cache keys include the normalized address, provider, adapter kind and model identity, excluding credentials. Changing a model or provider under the same engine ID requires explicit generation; reads never generate missing audio. Commit the matching cache and `speech.lock.json` for offline builds. An incomplete definition, including a model-only setting, is unavailable rather than an offline fallback. With no definition at all, request lookup accepts one locked result; multiple profiles for that request are ambiguous. Legacy locked audio remains readable offline, but cannot establish the identity of a configured provider. Every cache read verifies the audio SHA; alignment also verifies its audio and transcription profile.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
