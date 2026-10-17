/**
 * Trust modes and the server's own secrets (D13, docs/architecture.md 10.1):
 * SHARED mode's requirements, its refusal of third-party credentials, the
 * tokens read from files only root can read, and dropping privileges.
 */
import { readFileSync } from 'node:fs'
import type { GatewayAccess } from '@presmium/kernel'

/** The server's own secrets: the gateway's service token, agent-host's token, the login proxy's shared secret. */
export const OWN_SECRETS = ['PRESMIUM_GATEWAY_TOKEN', 'PRESMIUM_AGENT_HOST_TOKEN', 'PRESMIUM_PROXY_SECRET'] as const

/** Names of variables that hold credentials (not Presmium's own). */
const CREDENTIAL = /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i

/**
 * A secret of the server: from the file `<name>_FILE` names (only root can
 * read it in the compose layout, so it never is in the environment), else
 * from the variable itself (tests, which run as an ordinary user). A
 * process started as root to become another user (`filesOnly`) takes the
 * file only: its secrets are read once, as root, before it drops its
 * privileges, and are never in an environment (WP-91).
 */
export function readSecret(env: NodeJS.ProcessEnv, name: string, filesOnly = false): string | undefined {
  if (filesOnly && env[name]) throw new Error(`${name} is set in the environment of a process started as root: give it as a file only root may read (${name}_FILE), which is read before the process becomes its user`)
  const file = env[`${name}_FILE`]
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim() || undefined
    } catch (error) {
      throw new Error(`cannot read ${name}_FILE (${file}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return env[name] || undefined
}

/** Whether a variable is one of the server's own secrets, or names the file of one. */
export function ownSecret(name: string): boolean {
  return OWN_SECRETS.some(own => name === own || name === `${own}_FILE`)
}

/** Variables of `env` that look like third-party credentials: SHARED serve refuses to start with any (10.1). */
export function credentialVariables(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter(name => env[name] && CREDENTIAL.test(name) && !ownSecret(name)).sort()
}

/** What SHARED mode needs, read from the environment (and the token files). */
export interface SharedSetup {
  proxySecret?: string
  gateway: GatewayAccess
  agentHost: GatewayAccess
  consoleHost: string
}

/**
 * SHARED mode's setup, read once (the server's three secrets with it);
 * throws naming what is missing or what must not be there. `filesOnly`:
 * started as root, the secrets come from their files only.
 */
export function sharedSetup(env: NodeJS.ProcessEnv, filesOnly = false): SharedSetup {
  const missing: string[] = []
  const need = (name: string, value: string | undefined) => {
    if (!value) missing.push(name)
    return value ?? ''
  }
  const gateway = { url: need('PRESMIUM_GATEWAY_URL', env.PRESMIUM_GATEWAY_URL), token: need('PRESMIUM_GATEWAY_TOKEN', readSecret(env, 'PRESMIUM_GATEWAY_TOKEN', filesOnly)) }
  const agentHost = { url: need('PRESMIUM_AGENT_HOST_URL', env.PRESMIUM_AGENT_HOST_URL), token: need('PRESMIUM_AGENT_HOST_TOKEN', readSecret(env, 'PRESMIUM_AGENT_HOST_TOKEN', filesOnly)) }
  const consoleHost = need('PRESMIUM_CONSOLE_HOST', env.PRESMIUM_CONSOLE_HOST?.trim().toLowerCase())
  if (missing.length > 0) {
    throw new Error(`a presmium serve with a login is SHARED mode, which needs the gateway, agent-host and owner console (docs/architecture.md 10.1); missing: ${missing.join(', ')}`)
  }
  const credentials = credentialVariables(env)
  if (credentials.length > 0) {
    throw new Error(`SHARED mode keeps third-party credentials in the gateway only, but this environment has ${credentials.join(', ')}; remove them from serve's environment`)
  }
  return { proxySecret: readSecret(env, 'PRESMIUM_PROXY_SECRET', filesOnly), gateway, agentHost, consoleHost }
}

/**
 * Started as root, becomes `user` (a name or a uid; its group of the same
 * name or number), after the token files were read: the process then can no
 * longer read them, and it is not dumpable. Without root, nothing changes.
 */
export function dropPrivileges(user: string | undefined): void {
  if (!user || process.getuid?.() !== 0) return
  const id = /^\d+$/.test(user) ? Number(user) : user
  process.setgid!(id)
  process.setuid!(id)
}
