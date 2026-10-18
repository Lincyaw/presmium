# @presmium/slidev-addon-deltabox

Change review and a process sandbox through deltabox, on Linux hosts that qualify (glibc 2.39, FUSE and Landlock).

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

It is installed with `@presmium/cli` and loaded as an operator plugin; documents do not list it. It is a Node plugin only, with no components.

## What it provides

- A process sandbox for the Python and JavaScript run at build time: no network, writes only in the run directory.
- The review of an agent's changes in the workbench.

## Configuration

The operator's `settings.presmium.deltabox` (`sandbox`, `review`, `read`, `stateDir`) in `presmium.workspace.yaml` configures it.

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/presmium/presmium/blob/main/.agents/skills/presmium-author/references/directives.md) (Chinese): every directive with its options and an example
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
