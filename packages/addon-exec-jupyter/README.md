# @presmium/slidev-addon-exec-jupyter

Remote Jupyter environments at build time and in the browser, and a browser terminal.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @presmium/slidev-addon-exec-jupyter
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@presmium/slidev-addon-exec-jupyter'
```

It is a Presmium plugin and a Slidev addon: its components work on the web page and in the slides. It needs `@presmium/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- Named environments of `kind: jupyter`: code runs in the operator's Jupyter kernels, through the server's proxy in the browser.
- `{terminal}`: a terminal of the remote environment in the page.

## Configuration

The operator gives each environment's address and token in `PRESMIUM_ENV_<name>_URL` and `PRESMIUM_ENV_<name>_TOKEN`; documents hold no credentials.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
