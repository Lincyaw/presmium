# @presmium/slidev-addon-session

Classroom sessions: sync across devices and following the presenter.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/slidev-addon-session
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-session'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- Classroom sessions that learners join from their devices, and following the presenter's position.
- With `presmium dev` and `presmium serve`, the classroom server runs on their own port; otherwise point to a `@presmium/classroom-server`.

## Configuration

`presmium.session.server`: the classroom server (`ws://` or `http://`).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/Lincyaw/presmium/blob/main/docs/api.md)

## License

Apache-2.0
