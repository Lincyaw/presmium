# @presmium/slidev-addon-assistant

The AI assistant: readers' questions with their own model service, and, in the local workbench, changes to lectures by an agent that you review.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/slidev-addon-assistant
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-assistant'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- An Ask panel on the web page, the slides and the presenter view, also in static sites: readers ask about a section or a selection, with an OpenAI compatible model service they set up in their browser; the site needs no server.
- In `presmium serve` and `presmium dev`: agent runtimes over ACP (DeepSeek Harness bundled) that change a lecture from annotations or chat, with a review of each change before it is committed. This part belongs to the workbench and is experimental.

## Configuration

The operator provides the agent's model service in environment variables (`DEEPSEEK_API_KEY`, or `PRESMIUM_MODEL_URL`, `PRESMIUM_MODEL_KEY` and `PRESMIUM_MODEL_PROVIDER`) or in the workbench's model settings; without one the assistant starts no process. Reader questions need no operator setting.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/presmium/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
