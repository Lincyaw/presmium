# Shared deployment with docker compose

The layout of `docs/architecture.md` 10.5 (D13): the only layout a `presmium serve` with a login
(SHARED mode) supports, hardened and reviewed in WP-91 (`docs/architecture.md` 10.10).

| Service | Runs | Networks | Holds |
|---|---|---|---|
| `oauth2-proxy` | the login; the site's and the owner console's host names both go to serve | `public` (the one published port), `edge` | the login's settings (`oauth2-proxy.env`) |
| `serve` | `presmium serve --user serve`: the workspace service; none of the decks' code | `edge` (listens on its address only), `agents` (connects only) | its token files; no third-party credentials |
| `gateway` | `presmium gateway --user gateway`: model, speech and remote environments with the operator's credentials | `edge`, `agents`, `egress` | every third-party credential (`.env`), the operator directory |
| `sandbox` | `presmium agent-host --user sandbox`: compile-time execution, builds, the site's dev servers, agents | `agents` | its token file; no credentials |
| `classroom` | `presmium-classroom-server` | `edge` | — |

`edge` and `agents` are internal networks: serve and the classroom reach no outside address; sandbox
reaches the gateway only. The workspace volume belongs to serve; sandbox may write the document
directories only (group `presmium-docs`, set by `init.sh`), never `.git/`, the workspace configuration or
`node_modules/`.

## What the layout guarantees

Readers, editors, the agents they start and the decks' code are not trusted; the operator and the owners
are. With this layout:

- **serve writes nothing where sandbox may write.** Every file inside a document directory (a rejected
  change put back, a recording of compile-time code, a new, copied or deleted document, the links a
  rename rewrites, a revert) is written by agent-host as the sandbox's user, so a symbolic link the
  sandbox planted there leads nowhere it could not write itself.
- **serve's git reads nothing the sandbox wrote.** No system or global configuration, no attributes of
  the documents (no filter, diff or merge driver they name runs), the repository found from the workspace
  root (a `.git` planted in a document is never used). Git LFS for recorded media is configured by the
  operator in `.git/config` and `.git/info/attributes`, not by a document's `.gitattributes`.
- **Secrets stay where they are.** Third-party credentials are in the gateway only; serve, gateway and
  agent-host read their tokens once, as root, from the secret files (a token in a variable makes them
  refuse to start), then drop to their users. The site in the sandbox and the targets of plugin proxies
  get none of a member's cookies or identity headers; a proxy to the gateway carries a token scoped to its
  plugin, never serve's service token.
- **The owner console is apart.** Owner routes and owner proxies are on the console's host name only;
  the console takes requests from its own page only.
- **Readers get the student view only**, and the site serves them none of the documents' sources.

What remains is listed in `docs/architecture.md` 9.4 (processes of the sandbox's user see each other;
deltabox, when enabled, covers compile-time code only; plugins' own writes in serve).

## Set up

From this directory, in a checkout of Presmium where `pnpm install` has run (the image copies it):

1. **The workspace.** Put a workspace in `./seed` (or point `PRESMIUM_SEED` at one): a
   `presmium.workspace.yaml` with `members` and `settings`, and documents in subdirectories (a
   `lecture.md` at the root is refused). The `init` service copies it into the `workspace` volume
   once and makes it a git repository if it is none; later the volume is the workspace.
2. **Tokens.** Files only root may read, which serve, gateway and sandbox read as root before they
   become their users:

   ```sh
   mkdir -p secrets
   openssl rand -hex 32 > secrets/gateway_token
   openssl rand -hex 32 > secrets/agent_host_token
   chmod 600 secrets/*
   ```

3. **The login.** `cp oauth2-proxy.env.example oauth2-proxy.env` and fill in the identity provider.
   The cookie domain covers both host names (e.g. `course.example.edu` for the site and
   `console.course.example.edu` for the owner console).
4. **Credentials and host names.** `cp env.example .env`; set `PRESMIUM_CONSOLE_HOST` and the
   credentials of the services you use. `.env` goes to the gateway only; serve refuses to start with
   any credential in its environment.
5. `docker compose up -d --build`

Optional: `docker compose -f compose.yaml -f compose.deltabox.yaml up -d` gives sandbox what deltabox
needs (FUSE, `SYS_ADMIN`, `SYS_PTRACE`, AppArmor unconfined; the image has `fusermount3`) for the process
sandbox of compile-time code; these weaken the container, so they are not the default.

## Settings

- `PRESMIUM_PORT` (default 8080): the published port of oauth2-proxy.
- `PRESMIUM_EDGE` (default `172.31.79`): the first three parts of the `edge` subnet; oauth2-proxy is
  `.10`, serve `.11` (serve trusts the proxy by its address, `--trust-proxy-from`).
- `PRESMIUM_SOURCE`: the checkout to build the image from, when compose runs this file from elsewhere.
- `PRESMIUM_IMAGE`: the image's name.

The operator's plugins are the packages installed in the image (`node_modules` at the workspace root
links to them); list those the documents may use in `settings.presmium.workspace.plugins` (D14).

`packages/workspace/test/deploy.test.ts` starts this template (with a login proxy of its own beside
oauth2-proxy and a fake model service only the gateway reaches, `packages/workspace/test/fixtures/compose/`)
and checks the layout and the guarantees above. Several checkouts may run it at once: the project and the
image are named after `PRESMIUM_TEST_COMPOSE_PREFIX` and a random id, the ports and the edge subnet are
`PRESMIUM_DEPLOY_PORT` (and the port after it) and `PRESMIUM_DEPLOY_EDGE`; `PRESMIUM_DEPLOY_KEEP=1` leaves
the deployment up.
