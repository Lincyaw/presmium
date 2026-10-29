import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CloudError } from '../domain/errors.ts'
import type { AuthConfig } from './auth.ts'
import type { StudioProfile } from './studios.ts'
import { validateStudioProfile } from './studios.ts'

export interface CloudConfig {
  databaseUrl: string
  /** The console: login, the space, sharing, MCP access. */
  publicUrl: string
  /** Shared documents' sites, on an origin of their own. */
  contentUrl: string
  /** Every Studio has two hosts under this domain: `s-<slug>.<domain>` (Studio) and `p-<slug>.<domain>` (previews). */
  studioDomain: { scheme: 'http' | 'https', domain: string, port: string }
  host: string
  port: number
  auth: AuthConfig
  storage: { endpoint?: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string }
  runtime: {
    instanceId: string
    credentialKey: string
    profile: StudioProfile
    dockerSocket: string
    runnerContainerId?: string
    /** The console's container: the runner connects it to each Studio's private network. */
    gatewayContainerId?: string
    port: number
    storage?: { mountRoot: string, hostRoot: string, unenforced: boolean }
  }
}

const required = (env: NodeJS.ProcessEnv, key: string) => { const value = env[key]?.trim(); if (!value) throw new CloudError(500, 'configuration-missing', { key }); return value }
const port = (value: string | undefined, fallback: number): number => { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CloudError(500, 'configuration-port-invalid'); return n }
const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')

export async function readCloudConfig(env = process.env): Promise<CloudConfig> {
  const allow = env.CLOUD_ALLOW_INSECURE_LOOPBACK === 'true'
  const publicUrl = required(env, 'CLOUD_PUBLIC_URL'), contentUrl = required(env, 'CLOUD_CONTENT_URL'), studioUrl = new URL(required(env, 'CLOUD_STUDIO_URL'))
  for (const value of [publicUrl, contentUrl, studioUrl.href]) {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || allow && local(url.hostname) && url.protocol === 'http:')) throw new CloudError(500, 'configuration-public-url-invalid')
  }
  if (new Set([publicUrl, contentUrl].map(value => new URL(value).origin)).size !== 2) throw new CloudError(500, 'configuration-content-origin-required')
  // Studios are subdomains: the console and the shared content must not be one of them.
  for (const value of [publicUrl, contentUrl]) if (new URL(value).hostname.endsWith(`.${studioUrl.hostname}`)) throw new CloudError(500, 'configuration-studio-domain-invalid')
  const profile = JSON.parse(await readFile(resolve(required(env, 'CLOUD_STUDIO_PROFILE')), 'utf8')) as StudioProfile
  validateStudioProfile(profile)
  const unenforced = env.CLOUD_STORAGE_UNENFORCED === 'true'
  if (unenforced && !allow) throw new CloudError(500, 'runtime-storage-quota-required')
  return {
    databaseUrl: required(env, 'CLOUD_DATABASE_URL'), publicUrl, contentUrl,
    studioDomain: { scheme: studioUrl.protocol === 'https:' ? 'https' : 'http', domain: studioUrl.hostname, port: studioUrl.port },
    host: env.CLOUD_HOST ?? '127.0.0.1', port: port(env.CLOUD_PORT, 8787),
    auth: { publicUrl, issuer: required(env, 'CLOUD_OIDC_ISSUER'), clientId: required(env, 'CLOUD_OIDC_CLIENT_ID'), audience: required(env, 'CLOUD_OIDC_AUDIENCE'), clientSecret: env.CLOUD_OIDC_CLIENT_SECRET, issuerInternalUrl: env.CLOUD_OIDC_ISSUER_INTERNAL_URL, allowInsecureLoopback: allow },
    storage: { endpoint: env.CLOUD_S3_ENDPOINT, region: env.CLOUD_S3_REGION ?? 'us-east-1', bucket: required(env, 'CLOUD_S3_BUCKET'), accessKeyId: required(env, 'CLOUD_S3_ACCESS_KEY_ID'), secretAccessKey: required(env, 'CLOUD_S3_SECRET_ACCESS_KEY') },
    runtime: {
      instanceId: env.CLOUD_INSTANCE_ID ?? 'presmium-cloud', credentialKey: required(env, 'CLOUD_CREDENTIAL_KEY'), profile,
      dockerSocket: env.CLOUD_DOCKER_SOCKET ?? '/var/run/docker.sock', runnerContainerId: env.CLOUD_RUNNER_CONTAINER_ID, gatewayContainerId: env.CLOUD_GATEWAY_CONTAINER_ID,
      port: port(env.CLOUD_RUNNER_PORT, 8788),
      ...env.CLOUD_RUNTIME_STORAGE_MOUNT && env.CLOUD_RUNTIME_STORAGE_HOST ? { storage: { mountRoot: env.CLOUD_RUNTIME_STORAGE_MOUNT, hostRoot: env.CLOUD_RUNTIME_STORAGE_HOST, unenforced } } : {},
    },
  }
}

/** The two browser-facing origins of one Studio. */
export function studioOrigins(config: CloudConfig, slug: string): { studio: string, preview: string } {
  const { scheme, domain, port } = config.studioDomain, at = port ? `:${port}` : ''
  return { studio: `${scheme}://s-${slug}.${domain}${at}`, preview: `${scheme}://p-${slug}.${domain}${at}` }
}

/** The Studio slug and which of its hosts a request's `Host` names, if it is one. */
export function studioHost(config: CloudConfig, host: string | undefined): { slug: string, kind: 'studio' | 'preview' } | undefined {
  const name = (host ?? '').toLowerCase().replace(/:\d+$/, '')
  const suffix = `.${config.studioDomain.domain}`
  if (!name.endsWith(suffix)) return undefined
  const match = /^([sp])-([a-f0-9]{32})$/.exec(name.slice(0, -suffix.length))
  return match ? { slug: match[2]!, kind: match[1] === 's' ? 'studio' : 'preview' } : undefined
}
