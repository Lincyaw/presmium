# Presmium

[![npm](https://img.shields.io/npm/v/@lincyaw/presmium?label=npm)](https://www.npmjs.com/package/@lincyaw/presmium)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Presmium is an open-source presentation toolkit for teaching and technical communication. A single document, `index.pmd`, holds the text, equations, code, data, animation and narration of a lecture, and Presmium builds it into a website, slides, a Jupyter notebook and a narrated video.

**Live examples:** [profile.aoyangfang.top/presmium](https://profile.aoyangfang.top/presmium/) — feature collections, tutorials, complete courses and an animation reference, all built from the [gallery](examples/gallery/README.md) in this repository.

The [paper explainers](examples/papers/README.md) live in `examples/papers/`, with each paper under `papers/`. CI checks and builds them, and the Pages workflow publishes their website under `/papers/` alongside the gallery.

## Quick start

Presmium requires Node.js 22.19 or later and pnpm (`corepack enable pnpm`).

### Write on your own computer

```sh
pnpm setup                          # once, before the first global installation
pnpm add -g @lincyaw/presmium
presmium new my-lectures --type workspace
presmium studio my-lectures
```

Open the address it prints. In Studio you can start a blank document, import PowerPoint, Word or Markdown files, or have the AI assistant write a document from your source material (it asks for a model API key the first time: DeepSeek, Qwen, Kimi, GLM or any OpenAI-compatible service). Export the result as a website (ZIP), PDF, editable PowerPoint or a narrated video; voiceover uses free Microsoft Edge voices with no setup.

### Run it for other people

On a Linux server with Docker:

```sh
curl -fsSL https://raw.githubusercontent.com/Lincyaw/presmium/main/deploy/cloud/install.sh | bash
```

Each person registers an account and gets their own Studio in the browser. See [Self-hosting](#self-hosting).

### Publish a site on GitHub Pages

Publish a site to GitHub Pages in three steps.

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

`index.pmd` is read and written by tools rather than edited by hand. There are two ways to edit a document:

- **In the browser.** Install Presmium with `pnpm add -g @lincyaw/presmium` and run `presmium studio` in the project. Studio is included (experimental, about 865 MB with its dependencies). The workbench provides pages, rich text, step scripts, comments, version history, slides and video production. Editing and previewing need no language model; the AI assistant uses the API key entered under *Settings → Model*.
- **With the Claude Code plugin.** In Claude Code, run `/plugin marketplace add Lincyaw/presmium` and `/plugin install presmium@presmium`. It brings the authoring, animation, SVG figure and plugin skills, the `presmium` MCP tools (started with `pnpm dlx @lincyaw/presmium mcp`, excluding Presmium's packages from pnpm's `minimumReleaseAge`, in the project, so pnpm is the only requirement), and the commands `/presmium:new`, `/presmium:studio` and `/presmium:export-svg`.
- **With an AI coding tool.** Open the project in Claude Code, Codex or a similar tool and describe the change. Its `AGENTS.md` and `.agents/skills` describe the document and checks. The project's `.mcp.json` connects Claude Code launched from that directory to native MCP; configure Codex once with `codex mcp add presmium -- presmium mcp <absolute-project-path>`. The command starts or reuses a workspace service before initialization, ready for editing and captures. Open Studio with default local settings when a browser or approval window is needed. The original service owner stays running while other clients use it; [connection and ownership details](packages/mcp/README.md#connect).

Run `presmium check` after a change to validate the document.

## Command reference

Install Presmium, including Studio, the command line, renderers and official plugins, with `pnpm add -g @lincyaw/presmium` (run `pnpm setup` once before the first global installation). The global command always uses that installation; use `pnpm exec presmium` explicitly to run a project installation. To pin Presmium in a project, create it with `pnpm create presmium <dir>` and run `pnpm install` there: the project's `pnpm-workspace.yaml` already lists which dependencies may run install scripts, which pnpm 11 requires. To add it to a project of your own, copy that `allowBuilds` list first ([the package's README](packages/presmium/README.md#in-a-project)).

| Command | Description |
|---|---|
| `presmium new <dir> --type <kind>` | Create a project: `document` (one document), `workspace` (several documents), `site` (a website with a home page and a GitHub Pages workflow) or `plugin` |
| `presmium studio` | Open the browser workbench to edit documents, preview slides and produce videos |
| `presmium dev` | Preview one document's web page and slides, updating on save |
| `presmium serve` | Preview a workspace: its document list and every document's site |
| `presmium mcp` | Native MCP on stdio: starts or reuses the project's workspace authoring service; `--compiler-only` explicitly selects standalone compilation |
| `presmium check` | Validate a document: structure, links, code references and plugin checks |
| `presmium build` | Build into `dist/`: web pages, slides and notebooks; a workspace builds into `dist/web/` |

When a server runs behind a reverse proxy or under a path, pass the public address with `--public-url` (and, for the studio, the preview address with `--preview-url`), for example `https://example.com/studio/`.

Further reading: the [author guide](site/guide/index.pmd), the [plugin guide](site/plugins/index.pmd), [site themes and publishing](docs/site-themes.md) and the [architecture](docs/architecture.md).

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

Presmium can be deployed for a group of users: each registered user receives a complete workbench on JupyterHub, documents can be shared as links that others copy into their own space, and AI assistants such as Claude Code can work on a user's documents over MCP with an access token. On a Linux server with Docker and Docker Compose 2.24.4 or later, one command installs it:

```sh
curl -fsSL https://raw.githubusercontent.com/Lincyaw/presmium/main/deploy/cloud/install.sh | bash
```

It asks for one thing, the address:

- your own domain (one wildcard DNS record; `--domain example.com`): the console, sign-in, Studio and shared documents each get a name of their own;
- the server's IP, no domain (`--ip [ADDRESS]`): everything at one address, `https://ADDRESS/`. Without an address it uses the public IP only if that leads to the server; behind NAT (a campus or company network) it uses the server's address on its network and explains how to open it to the internet. A public IP gets a Let's Encrypt IP certificate; a private IP, a port other than 443 (`--port`) or a failed request uses a certificate from the server's own CA, which browsers warn about once. `--http` serves plain `http://ADDRESS/` for an intranet, where browsers disallow microphone recording and the clipboard;
- the server's public IP through sslip.io names (`--sslip`), or a local trial on `127.0.0.1` reached through an SSH tunnel (`--local`).

It generates every secret, pulls the published images (`--registry PREFIX` pulls them from a mirror of `ghcr.io/lincyaw/`; a failed pull is explained), starts the services and prints the address, or the specific reason when the address does not answer over HTTPS (a gateway's certificate on that IP, closed ports, DNS). Running it again with another address changes the address in place and keeps accounts and documents; `--help` lists the non-interactive options, and `bash ~/presmium-cloud/install.sh status | upgrade | uninstall` manages the installation. Manual deployment, resource limits, administration, backups and upgrades are described in the [cloud deployment guide](docs/cloud.md).

## License

[Apache-2.0](LICENSE)
