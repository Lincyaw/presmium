# Cloud hosting

The optional private `packages/cloud` app runs one complete Presmium Studio container per user. Read
`docs/rfc-cloud.md`, `docs/cloud-deployment.md` and `packages/cloud/project-index.yaml` before changing it.

Never reimplement Studio, the workbench or the workspace service in the cloud. Every feature an author uses
comes from the Studio image (`deploy/cloud/studio/`), which runs `presmium studio` with `--public-url` and
`--preview-url`. A missing feature in the cloud is a bug in the image, the gateway or those flags, not a reason
for a second implementation. Documents live only in each Studio's volume (a git workspace); PostgreSQL holds
accounts, Studio state, gate tickets and sessions, access tokens and shares.

Keep the trust split: the console (`serve`) has no Docker; the runner has Docker but never reads or writes
authors' files; file work (documents, snapshots, copies) happens in the Studio container's control service as
the author's unprivileged user. `PRESMIUM_CLOUD_*` variables stay in the container entry and never reach Studio.

The gateway checks a host-only gate cookie on each Studio host (`s-<slug>`, `p-<slug>`), bound to the owner,
the console session and the Studio generation, and forwards with `Host` kept and the gate cookie removed.
DeepSeek Harness's session cookie is SameSite=Strict, so its `/?token=` exchange must start from a page on the
Studio host, not from the console's redirect chain.

Keycloak/OIDC owns registration and passwords; preserve code/PKCE, state, nonce, issuer/audience and revocable
sessions. Shares are snapshots (`git archive` of HEAD plus a web build) in object storage; copies are committed
into the reader's own workspace with links and special files removed.

Deploy only the authorized Compose project; preserve unrelated containers and volumes. Do not print `.env`,
tokens or API keys. Real deployments need the XFS quota pool; `CLOUD_STORAGE_UNENFORCED=true` is for loopback
trials only.

Verify with a real loopback deployment and Chromium: register, open Studio, open a document (previews load),
the AI assistant's model settings, share, a second account's copy, MCP through `/mcp` with an access token,
stop and restart (files kept), light/dark and wide/narrow console views. Use lightweight structure checks, not
new tests or full suites unless explicitly requested. Record results and remaining limitations in a benchmark
note and the requirements index.
