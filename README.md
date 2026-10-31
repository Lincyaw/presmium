# Presmium

[![npm](https://img.shields.io/npm/v/@lincyaw/presmium?label=npm)](https://www.npmjs.com/package/@lincyaw/presmium)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Presmium is an open-source presentation toolkit for teaching and technical communication. A single document, `lecture.json`, holds the text, equations, code, data, animation and narration of a lecture, and Presmium builds it into a website, slides, a Jupyter notebook and a narrated video.

**Live examples:** [profile.aoyangfang.top/presmium](https://profile.aoyangfang.top/presmium/) — feature collections, tutorials, complete courses and an animation reference, all built from the [gallery](examples/gallery/README.md) in this repository.

## Quick start

Publish a site to GitHub Pages in three steps. Presmium requires Node.js 22.19 or later and pnpm (`corepack enable pnpm`).

1. **Create a site.**

   ```sh
   pnpm create presmium my-site --type site
   ```

   The project contains a home page, a first document, a GitHub Pages workflow and a git repository on the `main` branch.

2. **Install and push to GitHub.**

   ```sh
   cd my-site
   pnpm install
   git add -A && git commit -m "Create site"
   git remote add origin https://github.com/<user>/<repository>.git
   git push -u origin main
   ```

   Commit `pnpm-lock.yaml` with the project: the workflow installs from it.

3. **Enable GitHub Pages.** In the repository, open *Settings → Pages* and set *Source* to *GitHub Actions*. Every push to `main` then builds the site and publishes it; the workflow sets the site's base path automatically.

To preview the site locally, run `pnpm serve` and open the address it prints.

## Editing

`lecture.json` is read and written by tools rather than edited by hand. There are two ways to edit a document:

- **In the browser.** Install Presmium Studio with `pnpm add -g @lincyaw/studio` (experimental, about 865 MB) and run `presmium-studio` in the project. The workbench provides pages, rich text, step scripts, comments, version history, slides and video production. Editing and previewing need no language model; the AI assistant uses the API key entered under *Settings → Model*.
- **With an AI coding tool.** Open the project in Claude Code, Codex or a similar tool and describe the change. The project's `AGENTS.md` and the skills in `.agents/skills` describe the document format and how to check it.

Run `presmium check` after a change to validate the document.

## Command reference

Install the command line with `pnpm add -g @lincyaw/presmium` (run `pnpm setup` once before the first global installation).

| Command | Description |
|---|---|
| `presmium new <dir> --type <kind>` | Create a project: `lecture` (one document), `workspace` (several documents), `site` (a website with a home page and a GitHub Pages workflow) or `plugin` |
| `presmium dev` | Preview one document's web page and slides, updating on save |
| `presmium serve` | Preview a workspace: its document list and every document's site |
| `presmium check` | Validate a document: structure, links, code references and plugin checks |
| `presmium build` | Build into `dist/`: web pages, slides and notebooks; a workspace builds into `dist/web/` |

When a server runs behind a reverse proxy or under a path, pass the public address with `--public-url` (and, for the studio, the preview address with `--preview-url`), for example `https://example.com/studio/`.

Further reading: the [author guide](site/guide/lecture.json), the [plugin guide](site/plugins/lecture.json), [site themes and publishing](docs/site-themes.md) and the [architecture](docs/architecture.md).

## Development

```sh
git clone https://github.com/Lincyaw/presmium.git
cd presmium
pnpm install
pnpm add -g ./packages/presmium   # the global `presmium` now runs this checkout
pnpm studio                       # the workbench on an editable copy of the gallery
```

`pnpm studio` prepares an independent copy of the gallery in `.presmium/gallery-workspace` on first run and opens the workbench on it (port 4320 by default); `pnpm studio <dir>` opens another lecture or workspace. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## Self-hosting

Presmium can be deployed for a group of users: each registered user receives a complete workbench on JupyterHub, documents can be shared as links that others copy into their own space, and AI assistants such as Claude Code can work on a user's documents over MCP with an access token. Deployment requires Linux, Docker, Docker Compose 2.24.4 or later and four domains pointing to the server (console, sign-in, shared content and workbench).

```sh
cd deploy/cloud
bash keycloak/init-env.sh      # create .env with random secrets
# edit .env: the four domains, CLOUD_ACME_EMAIL and CLOUD_SMTP_*
docker compose --env-file .env -f compose.yaml build
docker compose --env-file .env -f compose.yaml --profile build-studio build studio-image
docker compose --env-file .env -f compose.yaml up -d
```

Without domains, add `-f compose.loopback.yaml` to try the deployment on `127.0.0.1:18787`. Resource limits, administration, backups and upgrades are described in the [cloud deployment guide](docs/cloud.md).

## License

[Apache-2.0](LICENSE)
