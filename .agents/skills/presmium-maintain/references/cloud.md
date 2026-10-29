# Cloud hosting

The optional private `packages/cloud` app is a separate multi-user product. Read
`docs/rfc-cloud.md`, `docs/cloud-deployment.md`, `packages/cloud/project-index.yaml`
and the current real-run record before changing it. Local workspace services remain
single-user tools.

PostgreSQL owns canonical TeachingDocument revisions and project text files. Web and
MCP use `Documents` for version checks, plans, persistent receipts and history. Never
create an independent writable source tree as another authority. Permissions are checked at each read, write and execution boundary. All existing non-AI
services are free; legacy spend scope is not required for them.

Keycloak/OIDC owns registration and passwords. Preserve code/PKCE, state, nonce,
issuer/audience and persistent revocable sessions. Keep author, identity, user-content
and Jupyter origins distinct. Private content capabilities expire and recheck membership;
published content rechecks revocation. Runtime browser grants are environment- and
generation-bound, and author logout revokes that browser grant.

Identity pages inherit the official Keycloak base templates and reuse the public design
entry, brand and controls. Build the theme with deploy/cloud/keycloak/build-theme.mjs;
fingerprint generated CSS/JS so ordinary refreshes see updates. Existing realms need
a loginTheme update, not reimport. Verify locale/appearance handoff, native form errors,
password reveal and menu keyboard behavior in light/dark and wide/narrow views.

Cloud editing reuses Studio document views and the standard workspace host protocol.
Ordinary compile, preview, presenting, export and code environments are free. Use
Admission.prepareJob with the exact source and target; matching retries share preparation.
Environment starts use a stable requestId and a finite free lease, without a quote UI.
Reuse Admission, Usage and RuntimeClient for persistent intent, actual zero-price
reserve/settle and resource quotas. Zero budget must not reject free operations.
Hosted AI is unavailable; Stripe keys alone must never enable purchases of missing AI
services. Keep the capability and checkout route disabled until a real product exists. A task never receives database, OIDC, object-store or payment credentials.
Only trusted runner/watchdog processes receive Docker control privileges; tenant
containers have bounded resources, a read-only root, hard storage limits and finite
lifetimes. Do not replace real quotas with a delayed directory-size check.

Deploy only the authorized Compose project. Preserve unrelated containers and volumes.
Do not print `.env`, bearer tokens, runtime tickets or provider secrets. Keep existing
credential keys stable across updates. Use the storage ownership marker and verified
mount before runner admission; missing enforcement must reject execution.

Verify actual registration, browser editing and restore, MCP scope/revocation, a real
Linux compile/export and Jupyter execution, stop/restart and zero-charge accounting. Observe
light/dark and wide/narrow UI. Use lightweight structure checks, not new tests or full
suites unless explicitly requested. Future AI/provider sandbox configuration is a separate real verification step; unavailable
AI and payment must stay visibly unavailable. Record measured
results and remaining limitations in the benchmark document and requirements index.
