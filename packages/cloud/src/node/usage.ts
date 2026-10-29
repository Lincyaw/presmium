import { CloudError, requireInteger, requireText } from '../domain/errors.ts'
import { planOf } from '../domain/plans.ts'
import type { Database, Sql } from './database.ts'
import type { PoolClient } from 'pg'

export interface ReservationRequest { context: { billingAccountId: string }, operationId: string, meter: string, maxAmountMinor: number }

export class Usage {
  readonly db: Database
  constructor(db: Database) { this.db = db }

  private async period(sql: Sql, accountId: string) {
    const account = (await sql.query('SELECT * FROM billing_accounts WHERE id=$1 FOR UPDATE', [accountId])).rows[0]
    if (!account) throw new CloudError(404, 'billing-account-not-found')
    await sql.query("INSERT INTO usage_periods(account_id,period_start,allowance_minor) VALUES($1,date_trunc('month',now() AT TIME ZONE 'UTC')::date,$2) ON CONFLICT(account_id,period_start) DO UPDATE SET allowance_minor=greatest(usage_periods.allowance_minor,excluded.allowance_minor)", [accountId, planOf(account.plan).monthlyAllowanceMinor])
    const period = (await sql.query("SELECT *,period_start::text AS period_key FROM usage_periods WHERE account_id=$1 AND period_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date FOR UPDATE", [accountId])).rows[0]!
    return { account, period }
  }

  async reserve(request: ReservationRequest, transaction?: PoolClient): Promise<{ reservationId: string }> {
    const amount = requireInteger(request.maxAmountMinor), operation = requireText(request.operationId), meter = requireText(request.meter)
    const work = async (sql: PoolClient) => {
      const { account, period } = await this.period(sql, request.context.billingAccountId)
      const known = (await sql.query('SELECT * FROM reservations WHERE account_id=$1 AND operation_id=$2', [account.id, operation])).rows[0]
      if (known) {
        if (Number(known.reserved_minor) !== amount || known.meter !== meter) throw new CloudError(409, 'operation-id-reused')
        if (known.state !== 'reserved') throw new CloudError(409, 'reservation-already-finished')
        return { reservationId: known.id }
      }
      const limit = Math.min(Number(period.allowance_minor), account.budget_limit_minor === null ? Number.MAX_SAFE_INTEGER : Number(account.budget_limit_minor))
      if (amount > 0 && Number(period.reserved_minor) + Number(period.consumed_minor) + amount > limit) throw new CloudError(402, 'budget-exceeded')
      const reservation = (await sql.query('INSERT INTO reservations(account_id,period_start,operation_id,meter,reserved_minor) VALUES($1,$2,$3,$4,$5) RETURNING id', [account.id, period.period_key, operation, meter, amount])).rows[0]!
      await sql.query('UPDATE usage_periods SET reserved_minor=reserved_minor+$3 WHERE account_id=$1 AND period_start=$2', [account.id, period.period_key, amount])
      await sql.query("INSERT INTO usage_ledger(account_id,reservation_id,operation_id,kind,amount_minor,meter) VALUES($1,$2,$3,'reserve',$4,$5)", [account.id, reservation.id, operation, amount, meter])
      return { reservationId: reservation.id }
    }
    return transaction ? work(transaction) : this.db.transaction(work)
  }

  async settle(request: { reservationId: string, operationId: string, actualAmountMinor: number }): Promise<void> {
    requireInteger(request.actualAmountMinor)
    await this.finish(request, 'settled')
  }

  async release(request: { reservationId: string, operationId: string }): Promise<void> {
    await this.finish({ ...request, actualAmountMinor: 0 }, 'released')
  }

  private async finish(request: { reservationId: string, operationId: string, actualAmountMinor: number }, state: 'settled' | 'released') {
    await this.db.transaction(async sql => {
      // All account mutations use the same account -> period -> reservation lock order.
      const peek = (await sql.query('SELECT account_id FROM reservations WHERE id=$1', [request.reservationId])).rows[0]
      if (!peek) throw new CloudError(404, 'reservation-not-found')
      await sql.query('SELECT id FROM billing_accounts WHERE id=$1 FOR UPDATE', [peek.account_id])
      const row = (await sql.query('SELECT * FROM reservations WHERE id=$1 FOR UPDATE', [request.reservationId])).rows[0]!
      if (row.operation_id !== request.operationId) throw new CloudError(409, 'reservation-operation-mismatch')
      if (row.state === state && Number(row.actual_minor) === request.actualAmountMinor) return
      if (row.state !== 'reserved') throw new CloudError(409, 'reservation-already-finished')
      if (request.actualAmountMinor > Number(row.reserved_minor)) throw new CloudError(409, 'reservation-amount-exceeded')
      await sql.query('UPDATE usage_periods SET reserved_minor=reserved_minor-$3,consumed_minor=consumed_minor+$4 WHERE account_id=$1 AND period_start=$2', [row.account_id, row.period_start, row.reserved_minor, request.actualAmountMinor])
      await sql.query('UPDATE reservations SET state=$2,actual_minor=$3,settled_at=now() WHERE id=$1', [row.id, state, request.actualAmountMinor])
      await sql.query('INSERT INTO usage_ledger(account_id,reservation_id,operation_id,kind,amount_minor,meter) VALUES($1,$2,$3,$4,$5,$6)', [row.account_id, row.id, row.operation_id, state === 'settled' ? 'settle' : 'release', request.actualAmountMinor, row.meter])
    })
  }

  async read(accountId: string) {
    return this.db.transaction(async sql => {
      const { account, period } = await this.period(sql, accountId)
      const ledger = (await sql.query('SELECT id,operation_id AS "jobId",kind,amount_minor::text AS amount,meter,created_at AS "createdAt" FROM usage_ledger WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100', [accountId])).rows
      const bytes = Number((await sql.query('SELECT coalesce(sum(o.bytes),0)::text AS bytes FROM objects o JOIN spaces s ON s.id=o.space_id WHERE s.billing_account_id=$1', [accountId])).rows[0]!.bytes)
      const environmentBytes = Number((await sql.query("SELECT coalesce(sum(coalesce((profile_snapshot->>'diskBytes')::bigint,1073741824)),0)::text AS bytes FROM cloud_environments WHERE billing_account_id=$1 AND destroyed_at IS NULL", [accountId])).rows[0]!.bytes)
      return { currency: account.currency, monthlyLimitMinor: Math.min(Number(period.allowance_minor), account.budget_limit_minor === null ? Number.MAX_SAFE_INTEGER : Number(account.budget_limit_minor)), allowanceMinor: Number(period.allowance_minor), spentMinor: Number(period.consumed_minor), reservedMinor: Number(period.reserved_minor), storageBytes: bytes + environmentBytes, objectBytes: bytes, environmentReservedBytes: environmentBytes, periodStart: period.period_key, ledger: ledger.map(row => ({ ...row, amountMinor: Number(row.amount), currency: account.currency })) }
    })
  }

  async setBudget(accountId: string, amount: number) {
    requireInteger(amount)
    await this.db.query('UPDATE billing_accounts SET budget_limit_minor=$2 WHERE id=$1', [accountId, amount])
  }
}
