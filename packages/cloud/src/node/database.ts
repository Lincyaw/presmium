import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { PoolClient } from 'pg'

export type Sql = Pick<PoolClient, 'query'>

export class Database {
  readonly pool: pg.Pool
  readonly query: pg.Pool['query']

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10, statement_timeout: 30_000, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 })
    this.query = this.pool.query.bind(this.pool)
    this.pool.on('error', error => process.stderr.write(`cloud database: ${error.message}\n`))
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
  }

  async migrate(directory = fileURLToPath(new URL('../../migrations/', import.meta.url))): Promise<void> {
    await this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('presmium.cloud.migrations', 0))")
      await client.query('CREATE TABLE IF NOT EXISTS cloud_migrations (name text PRIMARY KEY, digest text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
      for (const name of (await readdir(directory)).filter(name => /^\d+[-\w]*\.sql$/.test(name)).sort()) {
        const source = await readFile(`${directory}/${name}`, 'utf8')
        const digest = createHash('sha256').update(source).digest('hex')
        const previous = await client.query<{ digest: string }>('SELECT digest FROM cloud_migrations WHERE name = $1', [name])
        if (previous.rows[0]) {
          if (previous.rows[0].digest !== digest) throw new Error(`cloud migration changed after application: ${name}`)
          continue
        }
        await client.query(source)
        await client.query('INSERT INTO cloud_migrations(name,digest) VALUES($1,$2)', [name, digest])
      }
    })
  }

  async close(): Promise<void> { await this.pool.end() }
}
