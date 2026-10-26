# @lincyaw/addon-exec-local

Running code in a local container built from the repository's devcontainer definition, and exporting the environment.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-exec-local
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-exec-local'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{local-env}`: code that runs in the repository's devcontainer (with Docker and `presmium dev`), and the export of the code with its environment.
- Named environments of `kind: devcontainer` in `execute.environments`.

It needs Docker on the machine that builds or presents.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
