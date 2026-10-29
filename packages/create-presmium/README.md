# create-presmium

Starts a new [Presmium](https://github.com/Lincyaw/presmium) project: a lecture, a workspace, a themed site or a plugin. `presmium new` (from `pnpm add -g @lincyaw/presmium`) runs it; so does `pnpm create presmium`.

```sh
presmium new
presmium new my-lecture --type lecture --title "Tokenization"
presmium new my-course --type workspace --title "Data structures"
presmium new my-site --type site --theme course --title "My course"
presmium new presmium-plugin-greeting --type plugin --name presmium-plugin-greeting
```

Without arguments it asks for the kind of project, the directory and the title (or, for a plugin, the package name).

| Option | What |
|---|---|
| `--type <kind>` | `lecture` (one document), `workspace` (documents previewed with `presmium serve`), `site` (a themed workspace with a homepage and GitHub Pages workflow) or `plugin` |
| `--theme <name>` | For `site`: `course` (default), `docs` or `showcase` |
| `--title <text>` | The lecture's or the workspace's title (default: the directory's name) |
| `--name <name>` | The plugin's package name (default: the directory's name) |
| `--no-git` | Do not run `git init` |
| `-h`, `--help` | Show the help |

- A lecture: `lecture.json`; `presmium dev`, `presmium check`, `presmium build`.
- A workspace: `presmium.workspace.yaml` and a first document in `intro/`; `presmium serve`.
- A site: `presmium.workspace.yaml`, an independent homepage in `site/home.json`, a teaching document in `intro/lecture.json`, and `.github/workflows/pages.yml`; `pnpm install`, `pnpm serve`, `pnpm build`.
- A plugin: a directive, a React component shown in the web page and the slides, a server route, text in Chinese and English, an example document and integration tests; `pnpm install`, `pnpm test`, `pnpm dev`.

Lectures, workspaces and sites list `presmium` at create-presmium's own version as a dev dependency, so `pnpm install` pins it; without it the global `presmium` builds them. Each project gets an `AGENTS.md` (`CLAUDE.md` links to it) and copies of the Presmium skills for coding agents in `.agents/skills`. The text of the questions and of the new files follows the system's language (Chinese or English).

## Themed site

```sh
presmium new my-site --type site --theme showcase --title 'My work'
cd my-site
pnpm install
pnpm serve
```

Edit `site/home.json` to design the homepage and `intro/lecture.json` for the first teaching document. `site.landing.source` selects the homepage file; homepage content has its own structure, while teaching documents retain `lecture.json` as their sole content authority. Change `site.theme` and `site.params` in `presmium.workspace.yaml` to personalize the site. `pnpm build` exports `dist/web/`.

For your own HTML, CSS and JavaScript, replace the landing configuration with `site.landing: { template: './site/home.html' }`. The HTML entry and its local assets are bundled for static hosting; `script#presmium-site-data` provides the site's public document links. Refresh the homepage to rebuild that template during `pnpm serve`; template hot updates are not provided.

Push the project to a GitHub repository, select **GitHub Actions** in **Settings → Pages → Build and deployment → Source**, then run the generated Pages workflow or push to its configured branch. It reads the repository's Pages base path, builds the site and deploys `dist/web/`. The build remains an ordinary static site that can be hosted elsewhere.

See the [site theme guide](https://github.com/Lincyaw/presmium/blob/main/docs/site-themes.md) for the three presets, supported parameters and page layouts.

License: Apache-2.0.
