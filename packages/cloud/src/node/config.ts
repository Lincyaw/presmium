import { CloudError } from '../domain/errors.ts'
import type { AuthConfig } from './auth.ts'

export interface CloudConfig {
  databaseUrl: string
  /** The console: login, sharing, MCP access. */
  publicUrl: string
  /** Shared documents' sites: an origin of their own, or the console's origin (then served as sandboxed, opaque-origin documents). */
  contentUrl: string
  host: string
  port: number
  auth: AuthConfig
  storage: { endpoint?: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string }
  /**
   * JupyterHub: browsers open Studio at `publicUrl`, whose path is the Hub's base URL (`/studio/` when it shares the
   * console's origin); the console uses the API and the proxy with its service token.
   */
  hub: { publicUrl: string, basePath: string, apiUrl: string, proxyUrl: string, token: string }
}

const required = (env: NodeJS.ProcessEnv, key: string) => { const value = env[key]?.trim(); if (!value) throw new CloudError(500, 'configuration-missing', { key }); return value }
const port = (value: string | undefined, fallback: number): number => { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CloudError(500, 'configuration-port-invalid'); return n }
const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')

export async function readCloudConfig(env = process.env): Promise<CloudConfig> {
  const allowLoopback = env.CLOUD_ALLOW_INSECURE_LOOPBACK === 'true', allowHttp = env.CLOUD_ALLOW_INSECURE_HTTP === 'true'
  const publicUrl = required(env, 'CLOUD_PUBLIC_URL'), contentUrl = required(env, 'CLOUD_CONTENT_URL'), hubUrl = required(env, 'CLOUD_HUB_URL')
  const app = new URL(publicUrl), content = new URL(contentUrl), hub = new URL(hubUrl)
  for (const url of [app, content, hub]) {
    if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && (allowHttp || allowLoopback && local(url.hostname)))) throw new CloudError(500, 'configuration-public-url-invalid')
  }
  // Either every service has an origin of its own, or all share one: the Hub below a path and the shared sites at /p/.
  const origins = new Set([app, content, hub].map(url => url.origin)).size
  const basePath = `${hub.pathname.replace(/\/+$/, '')}/`
  if (app.pathname !== '/' || content.pathname !== '/' || (origins === 3 ? basePath !== '/' : origins !== 1 || basePath === '/' || !/^(\/[a-z0-9-]+)+\/$/.test(basePath) || ['/api/', '/p/', '/s/', '/mcp/'].includes(basePath))) {
    throw new CloudError(500, origins === 3 || origins === 1 ? 'configuration-public-url-invalid' : 'configuration-content-origin-required')
  }
  return {
    databaseUrl: required(env, 'CLOUD_DATABASE_URL'), publicUrl, contentUrl,
    host: env.CLOUD_HOST ?? '127.0.0.1', port: port(env.CLOUD_PORT, 8787),
    auth: { publicUrl, issuer: required(env, 'CLOUD_OIDC_ISSUER'), clientId: required(env, 'CLOUD_OIDC_CLIENT_ID'), audience: required(env, 'CLOUD_OIDC_AUDIENCE'), clientSecret: env.CLOUD_OIDC_CLIENT_SECRET, issuerInternalUrl: env.CLOUD_OIDC_ISSUER_INTERNAL_URL, allowInsecureLoopback: allowLoopback, allowInsecureHttp: allowHttp },
    storage: { endpoint: env.CLOUD_S3_ENDPOINT, region: env.CLOUD_S3_REGION ?? 'us-east-1', bucket: required(env, 'CLOUD_S3_BUCKET'), accessKeyId: required(env, 'CLOUD_S3_ACCESS_KEY_ID'), secretAccessKey: required(env, 'CLOUD_S3_SECRET_ACCESS_KEY') },
    hub: { publicUrl: new URL(basePath, hub).href, basePath, apiUrl: (env.CLOUD_HUB_API_URL ?? `http://hub:8081${basePath}hub/api`).replace(/\/+$/, ''), proxyUrl: (env.CLOUD_HUB_PROXY_URL ?? 'http://hub:8000').replace(/\/+$/, ''), token: required(env, 'CLOUD_HUB_API_TOKEN') },
  }
}
