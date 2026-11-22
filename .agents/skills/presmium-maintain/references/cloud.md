# Cloud hosting

The private `packages/cloud` app gives each user one complete Presmium Studio on JupyterHub. Read
`docs/cloud.md` and `packages/cloud/project-index.yaml` first.

- Never reimplement Studio, the workspace service or JupyterHub's jobs (sign-in, spawning, routing, idle
  culling). Author features come from the Studio image (`deploy/cloud/studio/`), whose `presmium_hub.py`
  runs `presmium studio` with `--public-url`, `--preview-url` and `--preview-port` behind
  jupyter-server-proxy (`studio/`, `preview/`, `cloud/` below `/user/<name>/`). A missing cloud feature is a
  bug in the image, `deploy/cloud/hub/` or those flags.
- The console (`presmium-cloud serve`) is a JupyterHub service. Hub user names are the OIDC `sub`.
  Documents live only in each user's volume; PostgreSQL holds accounts, tokens and shares. File work runs as
  the author's unprivileged user.
- Jupyter runtimes requested by documents (`metadata.execute.environments`, `auth: 'hub'`) spawn only on
  explicit Run or terminal open, never on compile or probe, as named servers with their own volumes and
  `PRESMIUM_RUNTIME_ONLY=1`. The Studio token manages only its owner's servers.
- First-preview latency: keep compilation, viewer build, bundling and loading apart.
  `PRESMIUM_VIEWER_SEED` is copied only on a matching fingerprint. Compress static assets, not streaming
  routes.
- Deployment goes through `deploy/cloud/install.sh` (one command; domain, sslip.io or loopback) and the images
  that `.github/workflows/cloud-images.yml` publishes to GHCR per release. A new setting in `compose.yaml` or
  `.env.example` needs its installer counterpart; check modes with `--dry-run`, shellcheck the script.
- Deploy only the authorized Compose project; preserve unrelated containers and volumes; never print `.env`,
  tokens or keys.

Verify with a real loopback deployment (`bash deploy/cloud/install.sh --local --build --name <own name> --dir <scratch>`,
with a source tarball through `--source` for uncommitted work) and Chromium: register, open Studio and a document through the Hub,
share and copy with a second account, MCP through `/mcp` with an access token, stop and reopen with files
kept, 403 for another user on every `/user/<name>/` path, and the console in light/dark and wide/narrow.
