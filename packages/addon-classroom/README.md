# @lincyaw/addon-classroom

Classroom features: quizzes, checked exercises, questions, feedback, predict-then-reveal and anchored notes.

Part of [Presmium](https://github.com/Lincyaw/presmium), which turns lectures written in MyST Markdown into web pages, slides, Jupyter notebooks and narrated lectures.

## Install

```sh
pnpm add -D @lincyaw/addon-classroom
```

List it in the headmatter of the documents that use it:

```yaml
plugins:
  - '@lincyaw/addon-classroom'
```

It is a Presmium plugin: its components work on the web page and in the slides. It needs `@lincyaw/cli` and the renderers in the same project, and declares the Presmium packages it shares with them as peer dependencies (Presmium 1.x).

## What it provides

- `{quiz}`, `{exercise}`, `{question-box}`, `{pulse}` and `{predict}`.
- Notes anchored to sections and blocks, and the presenter's overview of the classroom.

It works with `@lincyaw/addon-session` for the classroom's sync.

## Documentation

- [Author guide](https://github.com/Lincyaw/presmium/blob/main/site/guide/lecture.en.md) (Chinese: `site/guide/lecture.md`)
- [Directive reference](https://github.com/Lincyaw/presmium/blob/main/.agents/skills/presmium-author/references/document.md) (Chinese): every directive with its options and an example

## License

Apache-2.0
