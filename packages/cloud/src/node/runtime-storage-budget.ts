import type { PoolClient } from 'pg'
import { CloudError, requireId } from '../domain/errors.ts'
import { planOf } from '../domain/plans.ts'

type Sql = Pick<PoolClient, 'query'>

/** Shared account lock: take this before an environment or space lock. */
export async function lockStorageAccount(sql: Sql, accountId: string): Promise<{ plan: string }> {
  const row = (await sql.query<{ plan: string }>('SELECT plan FROM billing_accounts WHERE id=$1 FOR UPDATE', [requireId(accountId)])).rows[0]
  if (!row) throw new CloudError(404, 'billing-account-not-found')
  return row
}

export async function runtimeStorageUsage(sql: Sql, accountId: string): Promise<{ objectsBytes: number, environmentBytes: number, totalBytes: number }> {
  const row = (await sql.query<{ objects: string, environments: string }>(`SELECT
    (SELECT coalesce(sum(o.bytes),0)::text FROM objects o JOIN spaces s ON s.id=o.space_id WHERE s.billing_account_id=$1) AS objects,
    (SELECT coalesce(sum(coalesce((profile_snapshot->>'diskBytes')::bigint,1073741824)),0)::text FROM cloud_environments WHERE billing_account_id=$1 AND destroyed_at IS NULL) AS environments`, [accountId])).rows[0]!
  const objectsBytes = Number(row.objects), environmentBytes = Number(row.environments)
  return { objectsBytes, environmentBytes, totalBytes: objectsBytes + environmentBytes }
}

export async function assertStorageCapacity(sql: Sql, accountId: string, plan: string, extraBytes = 0): Promise<void> {
  if ((await runtimeStorageUsage(sql, accountId)).totalBytes + extraBytes > planOf(plan).storageBytes) throw new CloudError(413, 'storage-limit')
}
