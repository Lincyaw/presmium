import http from 'node:http'
import https from 'node:https'
import type { IncomingHttpHeaders, RequestOptions } from 'node:http'
import { CloudError } from '../domain/errors.ts'

export type DockerConnection =
  | { socketPath: string, apiVersion?: string }
  | { url: string, ca: string, cert: string, key: string, apiVersion?: string }

export interface ContainerInspection {
  Id: string
  Name: string
  Config: { Labels?: Record<string, string> }
  State: { Status: string, Running: boolean, ExitCode: number, StartedAt: string, FinishedAt: string, OOMKilled?: boolean, Error?: string }
  NetworkSettings: { Networks?: Record<string, { IPAddress: string }> }
}

export interface ContainerConfiguration {
  Image: string
  User: string
  WorkingDir?: string
  Cmd: string[]
  Env: string[]
  Labels: Record<string, string>
  HostConfig: {
    NetworkMode: string
    ReadonlyRootfs: boolean
    CapDrop: string[]
    SecurityOpt: string[]
    NanoCpus: number
    Memory: number
    MemorySwap: number
    PidsLimit: number
    Init: boolean
    Runtime?: string
    Mounts: Array<{ Type: 'volume', Source: string, Target: string, ReadOnly?: boolean }>
    Tmpfs: Record<string, string>
    LogConfig: { Type: string, Config: Record<string, string> }
  }
}

export class DockerError extends CloudError {
  readonly dockerStatus: number
  constructor(dockerStatus: number, code = 'runtime-engine-failed') { super(dockerStatus === 404 ? 404 : 502, code); this.dockerStatus = dockerStatus }
}

/** Docker's versioned public Engine HTTP API. No shell, host command, or tenant Docker options. */
export class DockerEngine {
  readonly #connection: DockerConnection
  readonly #prefix: string
  readonly #agent: http.Agent | https.Agent

  constructor(connection: DockerConnection) {
    const version = connection.apiVersion ?? 'v1.45'
    if (!/^v1\.\d+$/.test(version)) throw new CloudError(500, 'runtime-engine-version-invalid')
    if ('socketPath' in connection) {
      if (!connection.socketPath.startsWith('/')) throw new CloudError(500, 'runtime-engine-socket-invalid')
      this.#agent = new http.Agent({ keepAlive: true, maxSockets: 32 })
    } else {
      const url = new URL(connection.url)
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new CloudError(500, 'runtime-engine-url-invalid')
      if (!connection.ca || !connection.cert || !connection.key) throw new CloudError(500, 'runtime-engine-tls-required')
      this.#agent = new https.Agent({ keepAlive: true, maxSockets: 32, ca: connection.ca, cert: connection.cert, key: connection.key, rejectUnauthorized: true })
    }
    this.#connection = connection
    this.#prefix = `/${version}`
  }

  async #request(method: string, path: string, body?: unknown | Buffer, limit = 4 << 20, timeoutMs = 30_000): Promise<{ status: number, body: Buffer, headers: IncomingHttpHeaders }> {
    const bytes = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
    const options: RequestOptions = {
      method, path: `${this.#prefix}${path}`, agent: this.#agent,
      headers: bytes ? { 'content-type': Buffer.isBuffer(body) ? 'application/x-tar' : 'application/json', 'content-length': bytes.length } : {},
      ...'socketPath' in this.#connection ? { socketPath: this.#connection.socketPath } : {},
    }
    const connection = this.#connection
    return new Promise((resolve, reject) => {
      const request = 'socketPath' in connection
        ? http.request(options)
        : https.request(new URL(connection.url), options)
      request.setTimeout(timeoutMs, () => request.destroy(new CloudError(504, 'runtime-engine-timeout')))
      request.once('error', reject)
      request.once('response', response => {
        const chunks: Buffer[] = []
        let length = 0
        response.on('data', (chunk: Buffer) => {
          length += chunk.length
          if (length > limit) { response.destroy(new CloudError(413, 'runtime-engine-response-limit')); return }
          chunks.push(chunk)
        })
        response.once('error', reject)
        response.once('end', () => {
          const status = response.statusCode ?? 502
          if (status < 200 || status > 299) { reject(new DockerError(status)); return }
          resolve({ status, body: Buffer.concat(chunks), headers: response.headers })
        })
      })
      request.end(bytes)
    })
  }

  async ping(): Promise<void> { await this.#request('GET', '/_ping') }

  async inspect(id: string): Promise<ContainerInspection | undefined> {
    try { return JSON.parse((await this.#request('GET', `/containers/${encodeURIComponent(id)}/json`)).body.toString('utf8')) as ContainerInspection }
    catch (error) { if (error instanceof DockerError && error.dockerStatus === 404) return undefined; throw error }
  }

  async containers(labels: Record<string, string>): Promise<Array<{ Id: string, Names: string[], Labels: Record<string, string> }>> {
    const filters = encodeURIComponent(JSON.stringify({ label: Object.entries(labels).map(([key, value]) => `${key}=${value}`) }))
    return JSON.parse((await this.#request('GET', `/containers/json?all=1&filters=${filters}`)).body.toString('utf8'))
  }

  async create(name: string, config: ContainerConfiguration): Promise<string> {
    const response = await this.#request('POST', `/containers/create?name=${encodeURIComponent(name)}`, config)
    return (JSON.parse(response.body.toString('utf8')) as { Id: string }).Id
  }

  async start(id: string): Promise<void> {
    try { await this.#request('POST', `/containers/${encodeURIComponent(id)}/start`) }
    catch (error) { if (!(error instanceof DockerError && error.dockerStatus === 304)) throw error }
  }
  async stop(id: string, timeoutSeconds = 10): Promise<void> {
    try { await this.#request('POST', `/containers/${encodeURIComponent(id)}/stop?t=${timeoutSeconds}`, undefined, 4 << 20, (timeoutSeconds + 15) * 1000) }
    catch (error) { if (!(error instanceof DockerError && (error.dockerStatus === 304 || error.dockerStatus === 404))) throw error }
  }
  async remove(id: string): Promise<void> {
    try { await this.#request('DELETE', `/containers/${encodeURIComponent(id)}?force=1`) }
    catch (error) { if (!(error instanceof DockerError && error.dockerStatus === 404)) throw error }
  }
  async volume(name: string, labels: Record<string, string>, options?: Record<string, string>): Promise<void> {
    const response = await this.#request('POST', '/volumes/create', { Name: name, Labels: labels, ...options ? { Driver: 'local', DriverOpts: options } : {} })
    const volume = JSON.parse(response.body.toString('utf8')) as { Driver?: string, Labels?: Record<string, string>, Options?: Record<string, string> }
    // Docker returns an existing volume without changing its driver/options. Never reuse an old unlimited volume.
    if (Object.entries(labels).some(([key, value]) => volume.Labels?.[key] !== value)
      || (options && (volume.Driver !== 'local' || Object.keys(volume.Options ?? {}).length !== Object.keys(options).length || Object.entries(options).some(([key, value]) => volume.Options?.[key] !== value)))) throw new CloudError(409, 'runtime-volume-configuration-mismatch')
  }
  async removeVolume(name: string): Promise<void> {
    try { await this.#request('DELETE', `/volumes/${encodeURIComponent(name)}`) }
    catch (error) { if (!(error instanceof DockerError && error.dockerStatus === 404)) throw error }
  }

  async network(name: string, labels: Record<string, string>, runnerContainerId?: string): Promise<void> {
    try { await this.#request('POST', '/networks/create', { Name: name, Driver: 'bridge', Internal: true, CheckDuplicate: true, Labels: labels }) }
    catch (error) { if (!(error instanceof DockerError && error.dockerStatus === 409)) throw error }
    const network = JSON.parse((await this.#request('GET', `/networks/${encodeURIComponent(name)}`)).body.toString('utf8')) as { Internal?: boolean, Labels?: Record<string, string> }
    if (!network.Internal || Object.entries(labels).some(([key, value]) => network.Labels?.[key] !== value)) throw new CloudError(409, 'runtime-network-ownership-mismatch')
    if (runnerContainerId) {
      try { await this.#request('POST', `/networks/${encodeURIComponent(name)}/connect`, { Container: runnerContainerId }) }
      catch (error) {
        // A connected runner is expected after a restart; prove that connection before accepting conflict.
        const runner = await this.inspect(runnerContainerId)
        if (!runner?.NetworkSettings.Networks?.[name]) throw error
      }
    }
  }

  async removeNetwork(name: string, labels: Record<string, string>, runnerContainerId?: string): Promise<void> {
    let network: { Internal?: boolean, Labels?: Record<string, string>, Containers?: Record<string, unknown> }
    try { network = JSON.parse((await this.#request('GET', `/networks/${encodeURIComponent(name)}`)).body.toString('utf8')) }
    catch (error) { if (error instanceof DockerError && error.dockerStatus === 404) return; throw error }
    if (!network.Internal || Object.entries(labels).some(([key, value]) => network.Labels?.[key] !== value)) throw new CloudError(409, 'runtime-network-ownership-mismatch')
    const runner = runnerContainerId ? await this.inspect(runnerContainerId) : undefined
    const members = Object.keys(network.Containers ?? {})
    if (members.some(id => id !== runner?.Id)) throw new CloudError(409, 'runtime-network-in-use')
    if (runner && members.includes(runner.Id)) await this.#request('POST', `/networks/${encodeURIComponent(name)}/disconnect`, { Container: runner.Id, Force: false })
    try { await this.#request('DELETE', `/networks/${encodeURIComponent(name)}`) }
    catch (error) { if (!(error instanceof DockerError && error.dockerStatus === 404)) throw error }
  }

  async putArchive(id: string, path: string, archive: Buffer): Promise<void> {
    await this.#request('PUT', `/containers/${encodeURIComponent(id)}/archive?path=${encodeURIComponent(path)}`, archive)
  }
  async archive(id: string, path: string, limit: number): Promise<Buffer> {
    return (await this.#request('GET', `/containers/${encodeURIComponent(id)}/archive?path=${encodeURIComponent(path)}`, undefined, limit)).body
  }
  async logs(id: string, limit = 1 << 20): Promise<string> {
    const raw = (await this.#request('GET', `/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&tail=200`, undefined, limit)).body
    // Docker non-TTY streams carry an eight-byte frame header; exclude framing from diagnostics.
    const chunks: Buffer[] = []
    let offset = 0
    while (offset + 8 <= raw.length && raw[offset + 1] === 0 && raw[offset + 2] === 0 && raw[offset + 3] === 0) {
      const length = raw.readUInt32BE(offset + 4)
      if (offset + 8 + length > raw.length) break
      chunks.push(raw.subarray(offset + 8, offset + 8 + length))
      offset += 8 + length
    }
    return (chunks.length && offset === raw.length ? Buffer.concat(chunks) : raw).toString('utf8')
  }
  close(): void { this.#agent.destroy() }
}
