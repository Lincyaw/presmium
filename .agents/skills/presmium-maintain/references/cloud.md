# Cloud hosting

The optional private `packages/cloud` app gives each user one complete Presmium Studio on JupyterHub. Read
`docs/rfc-cloud.md`, `docs/cloud-deployment.md` and `packages/cloud/project-index.yaml` before changing it.

Never reimplement Studio, the workbench, the workspace service, or JupyterHub's jobs (sign-in to Studio, spawning,
routing, idle culling). Every author feature comes from the Studio image (`deploy/cloud/studio/`), a JupyterHub
single-user server whose extension `presmium_hub.py` runs `presmium studio` with `--public-url`, `--preview-url`
and `--preview-port`, and jupyter-server-proxy serves `studio/` (prefix stripped), `preview/` (path kept) and
`cloud/` (the control service) below `/user/<name>/`. A missing feature in the cloud is a bug in the image, the Hub
configuration (`deploy/cloud/hub/`) or those flags, not a reason for a second implementation.

For first-preview latency, separate compilation, viewer building, document bundling and browser loading. The Studio
image prebuilds the common viewer for official addons; `PRESMIUM_VIEWER_SEED` points at that read-only image cache.
Only a matching core and plugin fingerprint may be copied into the user's normal cache. Custom plugins still build
normally. Keep zstd/gzip enabled for static assets on the Hub entrance, leave streaming routes out of compression,
and verify the Studio's shared event WebSocket and runtime connections remain live.

The console (`presmium-cloud serve`) is a JupyterHub service: its token creates users, starts and stops servers,
and reaches `/user/<name>/cloud/` for documents, share snapshots, copies and the MCP relay. Hub user names are the
OIDC `sub`, so the console and the Hub name the same user. Documents live only in each user's volume (a git
workspace); PostgreSQL holds accounts, access tokens and shares. File work happens in the control service as the
author's unprivileged user.

DeepSeek Harness's session cookie is SameSite=Strict, so `/user/<name>/presmium` answers with a page that starts the
`studio/?token=` navigation itself. The Hub keeps running Studios on restart (`cleanup_servers = False`) and does not
demand a fresh login before the console spawns a user (`refresh_pre_spawn = False`).

Deploy only the authorized Compose project; preserve unrelated containers and volumes. Do not print `.env`,
tokens or API keys.

Documents can request an operator-defined JupyterHub profile with `kind: 'jupyter', auth: 'hub', profile: 'python'`
under `metadata.execute.environments`. Explicit Run or terminal-open calls the plugin's preparation route before
using its existing proxy; never spawn on compile, probe or a proxy getter. The Studio token may manage only its
owner's servers. Named runtime servers use separate volumes, profile limits and `PRESMIUM_RUNTIME_ONLY=1`, not a
second Studio or the author's private volume. Keep `CLOUD_ENVIRONMENT_PROFILES` and the named-server limit on the Hub.
Verify first spawn, reuse, restart, unknown profiles, page disposal and cross-user rejection; idle culling stops
named servers and removes their Hub records while retaining their volumes.

Verify with a real loopback deployment and Chromium: register, open Studio through the Hub, open a document
(previews load below `/user/<name>/preview/`), share, a second account's copy, MCP through `/mcp` with an access
token, stop and reopen (files kept), another user's 403 on every `/user/<name>/` path, and the console in
light/dark and wide/narrow views. Use lightweight structure checks, not new tests or full suites unless
explicitly requested. Record results and remaining limitations in a benchmark note and the requirements index.
