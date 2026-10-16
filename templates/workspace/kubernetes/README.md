# Kubernetes: the same layout, by hand

A reference, not tested: the only shared layout Presmium supports is the compose template
(`../compose/`, docs/architecture.md 10.5). Kubernetes can run the same three processes with the same
separation; the cluster, its ingress and certificates, and the identity provider are yours.

## Workloads

One image (the compose template's `Dockerfile`), three pods (or one pod with three containers only if
your cluster gives each container its own user namespace; separate pods are simpler to reason about):

| Pod | Command | `securityContext` | Volumes | Secrets |
|---|---|---|---|---|
| serve | `presmium serve /workspace --host 0.0.0.0 --port 4310 --trust-proxy-from <oauth2-proxy pod IP or a NetworkPolicy-guarded Service>` | runs as uid 1001, supplementary group 1100 | the workspace PVC (read-write) | `gateway_token`, `agent_host_token` as files (`PRESMIUM_GATEWAY_TOKEN_FILE`, `PRESMIUM_AGENT_HOST_TOKEN_FILE`), mode 0400 |
| gateway | `presmium gateway /workspace --operator-dir /operator --host 0.0.0.0 --hostname gateway` | uid 1002 | the workspace PVC (read-only), an operator PVC | `gateway_token`; the third-party credentials as environment variables |
| sandbox | `presmium agent-host /workspace --host 0.0.0.0 --hostname sandbox` | uid 1003, supplementary group 1100, `umask 002` (agent-host sets it with `--user`) | the workspace PVC (read-write; the file permissions allow the document directories only) | `agent_host_token` |

With `runAsUser` set, the processes start as their users; the token files must then be readable by
that user only (the compose layout reads them as root and drops privileges instead).

Prepare the workspace PVC as the compose template's `init.sh` does: owned by uid 1001, `.git` mode 0700,
document directories group 1100 with mode 2775.

## Network

- An ingress with oauth2-proxy in front of serve, for two host names: the site and the owner console
  (`PRESMIUM_CONSOLE_HOST`); the cookie domain covers both.
- NetworkPolicies: serve accepts traffic from oauth2-proxy and the gateway only; sandbox accepts
  traffic from serve only and may connect to the gateway only (no egress otherwise); the gateway alone
  has egress to the internet; serve has no egress beyond the gateway and sandbox.
- Services `gateway` and `sandbox` give serve and sandbox the host names the commands above answer to.

## Optional

deltabox in the sandbox needs `/dev/fuse`, `SYS_ADMIN`, `SYS_PTRACE` and AppArmor unconfined (see
`../compose/compose.deltabox.yaml`); they weaken the pod's isolation.
