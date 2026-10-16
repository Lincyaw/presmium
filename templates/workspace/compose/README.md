# Shared deployment with docker compose

The layout of `docs/architecture.md` 10.5 (D13): the only layout a `presmium serve` with a login
(SHARED mode) supports. Experimental until the security review of WP-91.

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
needs (FUSE, `SYS_ADMIN`, `SYS_PTRACE`, AppArmor unconfined) for the change review and the process
sandbox; these weaken the container, so they are not the default.

## Settings

- `PRESMIUM_PORT` (default 8080): the published port of oauth2-proxy.
- `PRESMIUM_EDGE` (default `172.31.79`): the first three parts of the `edge` subnet; oauth2-proxy is
  `.10`, serve `.11` (serve trusts the proxy by its address, `--trust-proxy-from`).
- `PRESMIUM_SOURCE`: the checkout to build the image from, when compose runs this file from elsewhere.
- `PRESMIUM_IMAGE`: the image's name.

The operator's plugins are the packages installed in the image (`node_modules` at the workspace root
links to them); list those the documents may use in `settings.presmium.workspace.plugins` (D14).

`packages/workspace/test/deploy.test.ts` starts this template and checks the layout.
