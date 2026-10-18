# create-presmium

Starts a new [Presmium](https://github.com/Lincyaw/presmium) project: a lecture, a workspace or a plugin.

```sh
npm create presmium@latest
```

Without arguments it asks for the kind of project, the directory and the title (or, for a plugin,
the package name). Arguments skip the questions:

```sh
npm create presmium@latest my-lecture -- --type lecture --title "Tokenization"
npm create presmium@latest my-course -- --type workspace --title "Data structures"
npm create presmium@latest presmium-plugin-greeting -- --type plugin --name presmium-plugin-greeting
```

| Option | What |
|---|---|
| `--type <kind>` | `lecture` (one document), `workspace` (documents edited and previewed with `presmium serve`) or `plugin` |
| `--title <text>` | The lecture's or the workspace's title (default: the directory's name) |
| `--name <name>` | The plugin's npm package name (default: the directory's name) |
| `--no-git` | Do not run `git init` |
| `-h`, `--help` | Show the help |

Each project lists `@presmium/cli`, the three renderers (`@presmium/web`, `@presmium/render-slides`,
`@presmium/render-notebook`) and the official plugins its documents use, at create-presmium's own
version (Presmium's packages are released together). It gets an `AGENTS.md` (`CLAUDE.md` links to
it) and copies of the Presmium skills for coding agents in `.agents/skills`.

- A lecture: `lecture.md`; `npm run dev`, `npm run check`, `npm run build`.
- A workspace: `presmium.workspace.yaml` and a first document in `intro/`; `npm run serve` starts the
  workbench, a preview that later versions will change.
- A plugin: a directive, a Vue component shown in the web page and the slides, a server route, text in
  Chinese and English, an example document and integration tests; `npm test`, `npm run dev`.

The text of the questions and of the new files follows the system's language (Chinese or English).

License: Apache-2.0.
