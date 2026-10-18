# @presmium/workspace

Presmium's workspace: the site of several documents (`presmium build` at a workspace root) and the local workbench `presmium serve`, with the document templates.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

It comes with `@presmium/cli`.

## Workspaces

A workspace has `presmium.workspace.yaml` at its root and each document in a subdirectory with its own `lecture.md`:

```yaml
title: Introduction to machine learning
documents: [week1/lecture.md, week2/lecture.md]
site:
  nav:
    - { text: Week 1, link: /week1/ }
```

`presmium build` at the root builds the site into `dist/web/`, with the documents' translations under `/<document>/<lang>/`.

## The workbench (preview)

`presmium serve` runs the workbench on your machine: the live site, editing the source in the browser, managing documents and the history of changes. Its browser side (`@presmium/workspace/client`, `@presmium/workspace/domain` and the routes behind it) is experimental and will be replaced by a new workbench; the command, the workspace configuration file and the Node services stay.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md): workspaces
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)
- [Security and the trust model](https://github.com/presmium/presmium/blob/main/SECURITY.md)

## License

Apache-2.0
