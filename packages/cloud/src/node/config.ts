import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CloudError } from '../domain/errors.ts'
import type { AuthConfig } from './auth.ts'
import type { BillingConfig } from './billing.ts'
import type { RuntimeProfile } from './environments.ts'
import { validateRuntimeProfiles } from './environments.ts'

export interface CloudConfig {
  databaseUrl: string
  publicUrl: string
  contentUrl: string
  runtimeUrl: string
  internalApiUrl: string
  inputSigningKey?: string
  host: string
  port: number
  auth: AuthConfig
  billing: BillingConfig
  storage?: { endpoint?: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string }
  runner?: { url: string, token: string }
  runtime: { instanceId: string, credentialKey?: string, profiles: RuntimeProfile[], dockerSocket?: string, runnerContainerId?: string, port: number, inputOrigins: string[], storage?: { mountRoot: string, hostRoot: string } }
}

const required = (env: NodeJS.ProcessEnv, key: string) => { const value = env[key]?.trim(); if (!value) throw new CloudError(500, 'configuration-missing', { key }); return value }
const port = (value: string | undefined, fallback: number): number => { const n = value === undefined ? fallback : Number(value); if (!Number.isInteger(n) || n < 1 || n > 65535) throw new CloudError(500, 'configuration-port-invalid'); return n }

export async function readCloudConfig(env = process.env): Promise<CloudConfig> {
  const publicUrl = required(env, 'CLOUD_PUBLIC_URL'), contentUrl = required(env, 'CLOUD_CONTENT_URL'), runtimeUrl = required(env, 'CLOUD_RUNTIME_URL')
  const allow = env.CLOUD_ALLOW_INSECURE_LOOPBACK === 'true'
  for (const value of [publicUrl, contentUrl, runtimeUrl]) {
    const url = new URL(value)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || allow && local && url.protocol === 'http:')) throw new CloudError(500, 'configuration-public-url-invalid')
  }
  if (new Set([publicUrl, contentUrl, runtimeUrl].map(value => new URL(value).origin)).size !== 3) throw new CloudError(500, 'configuration-content-origin-required')
  const profiles = env.CLOUD_PROFILES ? JSON.parse(await readFile(resolve(env.CLOUD_PROFILES), 'utf8')) as RuntimeProfile[] : []
  if (!Array.isArray(profiles)) throw new CloudError(500, 'runtime-profile-invalid')
  validateRuntimeProfiles(profiles)
  return {
    databaseUrl: required(env, 'CLOUD_DATABASE_URL'), publicUrl, contentUrl, runtimeUrl, internalApiUrl: env.CLOUD_INTERNAL_API_URL ?? publicUrl, inputSigningKey: env.CLOUD_INPUT_SIGNING_KEY,
    host: env.CLOUD_HOST ?? '127.0.0.1', port: port(env.CLOUD_PORT, 8787),
    auth: { publicUrl, issuer: required(env, 'CLOUD_OIDC_ISSUER'), clientId: required(env, 'CLOUD_OIDC_CLIENT_ID'), audience: required(env, 'CLOUD_OIDC_AUDIENCE'), clientSecret: env.CLOUD_OIDC_CLIENT_SECRET, issuerInternalUrl: env.CLOUD_OIDC_ISSUER_INTERNAL_URL, allowInsecureLoopback: allow },
    billing: { publicUrl, stripeSecretKey: env.CLOUD_STRIPE_SECRET_KEY, stripeWebhookSecret: env.CLOUD_STRIPE_WEBHOOK_SECRET, prices: Object.fromEntries([['pro', env.CLOUD_STRIPE_PRICE_PRO], ['team', env.CLOUD_STRIPE_PRICE_TEAM]].filter((entry): entry is [string, string] => Boolean(entry[1]))) },
    ...env.CLOUD_S3_BUCKET ? { storage: { endpoint: env.CLOUD_S3_ENDPOINT, region: env.CLOUD_S3_REGION ?? 'us-east-1', bucket: env.CLOUD_S3_BUCKET, accessKeyId: required(env, 'CLOUD_S3_ACCESS_KEY_ID'), secretAccessKey: required(env, 'CLOUD_S3_SECRET_ACCESS_KEY') } } : {},
    ...env.CLOUD_RUNNER_URL ? { runner: { url: env.CLOUD_RUNNER_URL, token: required(env, 'CLOUD_RUNNER_TOKEN') } } : {},
    runtime: { instanceId: env.CLOUD_INSTANCE_ID ?? 'presmium-cloud', credentialKey: env.CLOUD_CREDENTIAL_KEY, profiles, dockerSocket: env.CLOUD_DOCKER_SOCKET, runnerContainerId: env.CLOUD_RUNNER_CONTAINER_ID, port: port(env.CLOUD_RUNNER_PORT, 8788), inputOrigins: env.CLOUD_INPUT_ORIGINS?.split(',').map(value => new URL(value.trim()).origin) ?? [new URL(publicUrl).origin], ...env.CLOUD_RUNTIME_STORAGE_MOUNT && env.CLOUD_RUNTIME_STORAGE_HOST ? { storage: { mountRoot: env.CLOUD_RUNTIME_STORAGE_MOUNT, hostRoot: env.CLOUD_RUNTIME_STORAGE_HOST } } : {} },
  }
}
