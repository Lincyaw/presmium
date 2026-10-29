import { CloudError } from '../domain/errors.ts'
import type { AuthConfig } from './auth.ts'

export interface CloudConfig {
  databaseUrl: string
  /** The console: login, sharing, MCP access. */
  publicUrl: string
  /** Shared documents' sites, on an origin of their own. */
  contentUrl: string
  host: string
  port: number
  auth: AuthConfig
  storage: { endpoint?: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string }
  /** JupyterHub: browsers open Studio at `publicUrl`; the console uses the API and the proxy with its service token. */
  hub: { publicUrl: string, apiUrl: string, proxyUrl: string, token: string }
}

const required = (env: NodeJS.ProcessEnv, key: string) => { const value = env[key]?.trim(); if (!value) throw new CloudError(500, 'configuration-missing', { key }); return value }
const port = (value: string | undefined, fallback: number): number => { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CloudError(500, 'configuration-port-invalid'); return n }
const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost')

export async function readCloudConfig(env = process.env): Promise<CloudConfig> {
  const allow = env.CLOUD_ALLOW_INSECURE_LOOPBACK === 'true'
  const publicUrl = required(env, 'CLOUD_PUBLIC_URL'), contentUrl = required(env, 'CLOUD_CONTENT_URL'), hubUrl = required(env, 'CLOUD_HUB_URL')
  for (const value of [publicUrl, contentUrl, hubUrl]) {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || allow && local(url.hostname) && url.protocol === 'http:')) throw new CloudError(500, 'configuration-public-url-invalid')
  }
  if (new Set([publicUrl, contentUrl, hubUrl].map(value => new URL(value).origin)).size !== 3) throw new CloudError(500, 'configuration-content-origin-required')
  return {
    databaseUrl: required(env, 'CLOUD_DATABASE_URL'), publicUrl, contentUrl,
    host: env.CLOUD_HOST ?? '127.0.0.1', port: port(env.CLOUD_PORT, 8787),
    auth: { publicUrl, issuer: required(env, 'CLOUD_OIDC_ISSUER'), clientId: required(env, 'CLOUD_OIDC_CLIENT_ID'), audience: required(env, 'CLOUD_OIDC_AUDIENCE'), clientSecret: env.CLOUD_OIDC_CLIENT_SECRET, issuerInternalUrl: env.CLOUD_OIDC_ISSUER_INTERNAL_URL, allowInsecureLoopback: allow },
    storage: { endpoint: env.CLOUD_S3_ENDPOINT, region: env.CLOUD_S3_REGION ?? 'us-east-1', bucket: required(env, 'CLOUD_S3_BUCKET'), accessKeyId: required(env, 'CLOUD_S3_ACCESS_KEY_ID'), secretAccessKey: required(env, 'CLOUD_S3_SECRET_ACCESS_KEY') },
    hub: { publicUrl: hubUrl, apiUrl: (env.CLOUD_HUB_API_URL ?? 'http://hub:8081/hub/api').replace(/\/+$/, ''), proxyUrl: (env.CLOUD_HUB_PROXY_URL ?? 'http://hub:8000').replace(/\/+$/, ''), token: required(env, 'CLOUD_HUB_API_TOKEN') },
  }
}
