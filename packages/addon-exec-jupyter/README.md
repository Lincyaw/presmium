# @lincyaw/addon-exec-jupyter

Remote Jupyter environments at build time and in the browser, and a browser terminal.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/addon-exec-jupyter
```

Add this package to `metadata.plugins` in the document's `lecture.json`.

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- Named environments of `kind: jupyter`: code runs in the operator's Jupyter kernels, through the server's proxy in the browser.
- A terminal component connected to the declared remote environment.

## Configuration

The operator gives each environment's address and token in `PRESMIUM_ENV_<name>_URL` and `PRESMIUM_ENV_<name>_TOKEN`; documents hold no credentials.

On a configured JupyterHub deployment, a document can instead request a named profile:

```json
{
  "kind": "jupyter",
  "auth": "hub",
  "profile": "python",
  "kernel": "python3",
  "languages": ["python"]
}
```

Place this object at `metadata.execute.environments.lab`. Live code blocks use `execution.executor: "presmium.env.lab"`; blocks with the same `execution.session` share a kernel. Clicking Run or opening a terminal starts or reuses the current user's `env-python` server. Reading, compiling, probing and static output do not start servers. The operator maps profiles to images and resource limits; document URLs and images cannot override that mapping. Tokens stay on the server. See the [cloud deployment guide](https://github.com/Lincyaw/presmium/blob/main/docs/cloud.md).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json) (Chinese: `site/guide/lecture.json`)
- [Document contract](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md): normalized entities, parameters, states and shared validation

## License

Apache-2.0
