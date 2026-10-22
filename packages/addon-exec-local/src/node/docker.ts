import { spawnSync } from 'node:child_process'
import type { RunContext } from '@lincyaw/kernel'
import { minimalRunEnv } from '@lincyaw/kernel/node'
import { runProcess } from './process.ts'

const DOCKER_CLIENT = ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_CERT_PATH', 'DOCKER_TLS_VERIFY', 'XDG_RUNTIME_DIR', 'HOME']

/** The run's environment with the variables the Docker client needs to reach the daemon. */
export function dockerEnv(ctx?: RunContext): Record<string, string> {
  const env: Record<string, string> = { ...ctx?.env ?? minimalRunEnv() }
  for (const name of DOCKER_CLIENT) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

let docker: Promise<boolean> | undefined

export function dockerAvailable(): Promise<boolean> {
  if (!docker) {
    const probe = runProcess('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 10_000, env: dockerEnv() }).then(result => result.code === 0)
    docker = probe
    void probe.then((answers) => {
      if (!answers && docker === probe) docker = undefined
    })
  }
  return docker
}

let dockerSync: boolean | undefined

export function isDockerAvailableSync(): boolean {
  dockerSync ??= spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore', timeout: 10_000, env: dockerEnv() }).status === 0
  return dockerSync
}
