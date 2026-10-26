# create-presmium

Starts a new [Presmium](https://github.com/Lincyaw/presmium) project: a lecture, a workspace or a plugin. `presmium new` (from `pnpm add -g @lincyaw/presmium`) runs it; so does `pnpm create presmium`.

```sh
presmium new
presmium new my-lecture --type lecture --title "Tokenization"
presmium new my-course --type workspace --title "Data structures"
presmium new presmium-plugin-greeting --type plugin --name presmium-plugin-greeting
```

Without arguments it asks for the kind of project, the directory and the title (or, for a plugin, the package name).

| Option | What |
|---|---|
| `--type <kind>` | `lecture` (one document), `workspace` (documents previewed with `presmium serve`) or `plugin` |
| `--title <text>` | The lecture's or the workspace's title (default: the directory's name) |
| `--name <name>` | The plugin's package name (default: the directory's name) |
| `--no-git` | Do not run `git init` |
| `-h`, `--help` | Show the help |

- A lecture: `lecture.json`; `presmium dev`, `presmium check`, `presmium build`.
- A workspace: `presmium.workspace.yaml` and a first document in `intro/`; `presmium serve`.
- A plugin: a directive, a React component shown in the web page and the slides, a server route, text in Chinese and English, an example document and integration tests; `pnpm install`, `pnpm test`, `pnpm dev`.

Lectures and workspaces list `presmium` at create-presmium's own version as a dev dependency, so `pnpm install` pins it; without it the global `presmium` builds them. Each project gets an `AGENTS.md` (`CLAUDE.md` links to it) and copies of the Presmium skills for coding agents in `.agents/skills`. The text of the questions and of the new files follows the system's language (Chinese or English).

License: Apache-2.0.
