# @presmium/render-notebook

Presmium's notebook renderer: writes the IR as a Jupyter notebook (nbformat 4). Narration becomes Markdown cells, code in the kernel's language becomes code cells with their recorded outputs, and components show their fallback.

Part of [Presmium](https://github.com/presmium/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
npm install -D @presmium/cli @presmium/render-notebook
```

## Configuration

In the headmatter, `renderers.notebook`: `kernel` (default `python3`) and `webUrl`, where components the notebook cannot show link to (by default `../web/` when the web pages are built too).

## Documentation

- [Author guide](https://github.com/presmium/presmium/blob/main/site/guide/lecture.en.md)
- [Interfaces and versions](https://github.com/presmium/presmium/blob/main/docs/api.md)

## License

Apache-2.0
