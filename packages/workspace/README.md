# @lincyaw/workspace

Presmium's workspace: the site of several documents (`presmium build` at a workspace root) and the local workbench `presmium serve`, with the document templates.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

It comes with `@lincyaw/cli`.

## Workspaces

A workspace has `presmium.workspace.yaml` at its root and each document in a subdirectory with its own `lecture.json`:

```yaml
title: Introduction to machine learning
documents: [week1/lecture.json, week2/lecture.json]
site:
  nav:
    - { text: Week 1, link: /week1/ }
```

`presmium build` at the root builds the site into `dist/web/`, with the documents' translations under `/<document>/<lang>/`.

## The workbench (preview)

`presmium serve` runs the workbench on your machine: the live site, editing the source in the browser, managing documents and the history of changes. The routes the workbench (`@lincyaw/workbench`) uses are experimental; the command, the workspace configuration file and the Node services stay.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json): workspaces
- [Security and the trust model](https://github.com/Lincyaw/presmium/blob/main/SECURITY.md)

## License

Apache-2.0
