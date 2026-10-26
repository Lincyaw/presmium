# @lincyaw/render-notebook

Presmium's notebook renderer: writes the IR as a Jupyter notebook (nbformat 4). Narration becomes Markdown cells, code in the kernel's language becomes code cells with their recorded outputs, and components show their fallback.

Part of [Presmium](https://github.com/Lincyaw/presmium), which compiles canonical lecture.json teaching documents into web pages, slides, Jupyter notebooks and narrated playback.

## Install

```sh
pnpm add -D @lincyaw/cli @lincyaw/render-notebook
```

## Configuration

In `lecture.json`, `metadata.renderers.notebook`: `kernel` (default `python3`) and `webUrl`, where components the notebook cannot show link to (by default `../web/` when the web pages are built too).

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/locales/en/lecture.json)

## License

Apache-2.0
