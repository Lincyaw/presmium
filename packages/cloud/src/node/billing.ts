import { createHash } from 'node:crypto'
import type { Hono } from 'hono'
import type { PoolClient } from 'pg'
import Stripe from 'stripe'
import { CloudError, requireId, requireText } from '../domain/errors.ts'
import { PLANS } from '../domain/plans.ts'
import type { CloudUser } from './auth.ts'
import type { Database } from './database.ts'

export interface BillingConfig {
  publicUrl: string
  stripeSecretKey?: string
  stripeWebhookSecret?: string
  prices: Record<string, string>
}

export interface BillingDependencies {
  service: BillingService
  requireUser(request: Request): Promise<CloudUser>
  assertCsrf(request: Request): Promise<void>
  authorizeAccount(userId: string, accountId: string): Promise<void>
}

export interface BillingService {
  readonly configured: boolean
  checkout(accountId: string, plan: string, requestId: string): Promise<{ url: string }>
  portal(accountId: string): Promise<{ url: string }>
  subscription(accountId: string): Promise<Record<string, unknown>>
  acceptWebhook(request: Request): Promise<{ accepted: true, duplicate: boolean }>
  processPendingEvents(limit?: number): Promise<{ processed: number, failed: number }>
}

interface AccountRow { id: string, stripe_customer_id: string | null, plan: string, owner_id: string }
interface EventRow { id: string, type: string, payload: Stripe.Event, state: string, attempts: number }
interface SubscriptionRow { provider_id: string, status: string, price_id: string | null, period_start: Date | null, period_end: Date | null, cancel_at_period_end: boolean }

const signature = (value: string) => createHash('sha256').update(value).digest('hex')
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
const reference = (value: unknown) => typeof value === 'string' ? value : typeof object(value).id === 'string' ? object(value).id as string : undefined
const unixDate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null

async function rawBody(request: Request): Promise<Buffer> {
  const max = 1 << 20
  if (Number(request.headers.get('content-length')) > max) throw new CloudError(413, 'billing-webhook-too-large')
  const reader = request.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new CloudError(413, 'billing-webhook-too-large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

/** Billing is reserved for implemented AI services; ordinary authoring never enables purchases. */
export function createBillingService(db: Database, config: BillingConfig): BillingService {
  const publicUrl = new URL(config.publicUrl)
  const prices = Object.fromEntries(Object.entries(config.prices).filter(([plan, price]) => plan !== 'free' && Object.hasOwn(PLANS, plan) && typeof price === 'string' && /^price_[A-Za-z0-9]+$/.test(price)))
  if (Object.keys(prices).length !== new Set(Object.values(prices)).size) throw new CloudError(500, 'billing-configuration-invalid')
  const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey, { timeout: 15_000, maxNetworkRetries: 1 }) : undefined
  // No hosted AI product is implemented. Payment keys alone must never enable sales.
  const hostedAiAvailable = false
  const configured = Boolean(hostedAiAvailable && stripe && config.stripeWebhookSecret && Object.keys(prices).length)
  const provider = () => { if (!configured || !stripe) throw new CloudError(503, 'billing-unavailable'); return stripe }
  let processing: Promise<{ processed: number, failed: number }> | undefined

  const account = async (client: Pick<PoolClient, 'query'>, accountId: string) => {
    const result = await client.query<AccountRow>('SELECT id, owner_id, stripe_customer_id, plan FROM billing_accounts WHERE id = $1', [requireId(accountId)])
    if (!result.rows[0]) throw new CloudError(404, 'billing-account-missing')
    return result.rows[0]
  }

  // Session locks also cover the provider request; independently delivered events cannot
  // read an old provider snapshot and publish it after another replica's newer snapshot.
  const withAccountLock = async <T>(accountId: string, work: (client: PoolClient) => Promise<T>) => {
    const key = `presmium.billing.account:${requireId(accountId)}`
    const client = await db.pool.connect()
    try {
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
      return await work(client)
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]).catch(() => {})
      client.release()
    }
  }

  const customerFor = async (client: PoolClient, current: AccountRow): Promise<string> => {
    if (current.stripe_customer_id) return current.stripe_customer_id
    const owner = await client.query<{ email: string | null, name: string }>('SELECT email, name FROM users WHERE id = $1', [current.owner_id])
    const customer = await provider().customers.create({ metadata: { presmium_account: current.id }, ...owner.rows[0]?.email ? { email: owner.rows[0].email } : {}, ...owner.rows[0]?.name ? { name: owner.rows[0].name } : {} }, { idempotencyKey: `presmium:customer:${current.id}` })
    await client.query('UPDATE billing_accounts SET stripe_customer_id = $2 WHERE id = $1', [current.id, customer.id])
    return customer.id
  }

  const refreshSubscription = async (customerId: string) => {
    const found = await db.query<{ id: string }>('SELECT id FROM billing_accounts WHERE stripe_customer_id = $1', [customerId])
    if (!found.rows[0]) return // Events for products outside this application grant nothing.
    await withAccountLock(found.rows[0].id, async client => {
      const current = await account(client, found.rows[0]!.id)
      const latest = await provider().subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
      if (latest.has_more) throw new CloudError(503, 'billing-subscriptions-ambiguous')
      const supported = latest.data.filter(item => item.metadata.presmium_account === current.id)
      const live = supported.filter(item => item.status === 'active' || item.status === 'trialing')
      if (live.length > 1) throw new CloudError(503, 'billing-subscriptions-ambiguous')
      const selected = live[0] ?? supported.sort((a, b) => b.created - a.created)[0]
      await client.query('BEGIN')
      try {
        if (!selected) {
          await client.query('DELETE FROM subscriptions WHERE account_id = $1', [current.id])
          await client.query("UPDATE billing_accounts SET plan = 'free' WHERE id = $1", [current.id])
        } else {
          const line = selected.items.data[0]
          const priceId = line?.price.id ?? null
          const plan = Object.entries(prices).find(([, price]) => price === priceId)?.[0]
          const supportedPrice = Boolean(plan && selected.items.data.length === 1 && line?.quantity === 1)
          const fields = object(line), oldFields = object(selected)
          const start = unixDate(fields.current_period_start ?? oldFields.current_period_start)
          const end = unixDate(fields.current_period_end ?? oldFields.current_period_end)
          await client.query(`INSERT INTO subscriptions (account_id, provider_id, status, price_id, period_start, period_end, cancel_at_period_end)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (account_id) DO UPDATE SET provider_id = EXCLUDED.provider_id, status = EXCLUDED.status,
              price_id = EXCLUDED.price_id, period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
              cancel_at_period_end = EXCLUDED.cancel_at_period_end, updated_at = now()`, [current.id, selected.id, selected.status, priceId, start, end, selected.cancel_at_period_end])
          await client.query('UPDATE billing_accounts SET plan = $2 WHERE id = $1', [current.id, live.length === 1 && supportedPrice ? plan : 'free'])
        }
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error }
    })
  }

  const processEvent = async (eventId: string): Promise<boolean> => {
    const client = await db.pool.connect()
    const key = `presmium.billing.event:${eventId}`
    let locked = false
    try {
      const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [key])
      locked = lock.rows[0]?.locked === true
      if (!locked) return false
      const result = await client.query<EventRow>(`UPDATE billing_events SET state = 'processing', attempts = attempts + 1,
          next_attempt_at = now() + interval '2 minutes'
        WHERE id = $1 AND state <> 'processed' AND next_attempt_at <= now()
        RETURNING id, type, payload, state, attempts`, [eventId])
      const event = result.rows[0]
      if (!event) return false
      try {
        const resource = object(event.payload.data.object)
        if (event.type.startsWith('customer.subscription.') || event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' || event.type.startsWith('invoice.')) {
          const customer = reference(resource.customer)
          if (customer) await refreshSubscription(customer)
        }
        await client.query("UPDATE billing_events SET state = 'processed', error_code = NULL, processed_at = now() WHERE id = $1", [eventId])
      } catch (error) {
        const code = error instanceof CloudError ? error.code : 'billing-provider-failed'
        await client.query(`UPDATE billing_events SET state = 'failed', error_code = $2,
          next_attempt_at = now() + $3 * interval '1 second' WHERE id = $1`, [eventId, code, Math.min(3600, 15 * 2 ** Math.min(event.attempts, 8))])
        throw error
      }
      return true
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]).catch(() => {})
      client.release()
    }
  }

  const service: BillingService = {
    configured,
    async checkout(accountId, plan, requestId) {
      provider()
      const price = prices[requireText(plan, 'billing-plan-invalid', 40)]
      if (!price) throw new CloudError(422, 'billing-plan-invalid')
      const intent = requireText(requestId, 'billing-request-invalid', 120)
      return withAccountLock(accountId, async client => {
        const current = await account(client, accountId)
        const customer = await customerFor(client, current)
        // A second subscription must be a portal change, rather than two simultaneous bills.
        const subscriptions = await provider().subscriptions.list({ customer, status: 'all', limit: 100 })
        if (subscriptions.has_more || subscriptions.data.some(item => !['canceled', 'incomplete_expired'].includes(item.status))) throw new CloudError(409, 'billing-subscription-exists')
        const pending = await provider().checkout.sessions.list({ customer, status: 'open', limit: 100 })
        if (pending.has_more) throw new CloudError(503, 'billing-checkouts-ambiguous')
        const ownPending = pending.data.filter(item => item.mode === 'subscription' && item.metadata?.presmium_account === current.id)
        const reusable = ownPending.find(item => item.metadata?.presmium_plan === plan && item.url)
        if (reusable?.url) return { url: reusable.url }
        for (const item of ownPending) await provider().checkout.sessions.expire(item.id)
        const checkout = await provider().checkout.sessions.create({
          mode: 'subscription', customer, client_reference_id: current.id,
          line_items: [{ price, quantity: 1 }],
          metadata: { presmium_account: current.id, presmium_plan: plan }, subscription_data: { metadata: { presmium_account: current.id } },
          success_url: new URL('/?billing=returned', publicUrl).href,
          cancel_url: new URL('/?billing=cancelled', publicUrl).href,
        }, { idempotencyKey: `presmium:checkout:${current.id}:${signature(`${intent}:${plan}`)}` })
        if (!checkout.url) throw new CloudError(502, 'billing-checkout-unavailable')
        return { url: checkout.url }
      })
    },
    async portal(accountId) {
      provider()
      const current = await account(db, accountId)
      if (!current.stripe_customer_id) throw new CloudError(409, 'billing-customer-missing')
      const portal = await provider().billingPortal.sessions.create({ customer: current.stripe_customer_id, return_url: publicUrl.origin })
      return { url: portal.url }
    },
    async subscription(accountId) {
      const current = await account(db, accountId)
      const subscription = await db.query<SubscriptionRow>('SELECT provider_id, status, price_id, period_start, period_end, cancel_at_period_end FROM subscriptions WHERE account_id = $1', [current.id])
      const saved = subscription.rows[0]
      return { accountId: current.id, plan: current.plan, configured, aiAvailable: hostedAiAvailable, availablePlans: configured ? Object.keys(prices) : [], subscription: saved ? { id: saved.provider_id, status: saved.status, periodStart: saved.period_start?.toISOString() ?? null, periodEnd: saved.period_end?.toISOString() ?? null, cancelAtPeriodEnd: saved.cancel_at_period_end } : null }
    },
    async acceptWebhook(request) {
      const api = provider()
      const signed = request.headers.get('stripe-signature')
      if (!signed) throw new CloudError(400, 'billing-webhook-invalid')
      const body = await rawBody(request)
      let event: Stripe.Event
      try { event = api.webhooks.constructEvent(body, signed, config.stripeWebhookSecret!) }
      catch { throw new CloudError(400, 'billing-webhook-invalid') }
      const saved = await db.query('INSERT INTO billing_events (id, type, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id', [event.id, event.type, event])
      return { accepted: true, duplicate: saved.rowCount === 0 }
    },
    processPendingEvents(limit = 20) {
      if (processing) return processing
      processing = (async () => {
        if (!configured) return { processed: 0, failed: 0 }
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new CloudError(400, 'billing-limit-invalid')
        const events = await db.query<{ id: string }>("SELECT id FROM billing_events WHERE state <> 'processed' AND next_attempt_at <= now() ORDER BY created_at LIMIT $1", [limit])
        let processed = 0, failed = 0
        for (const event of events.rows) {
          try { if (await processEvent(event.id)) processed++ }
          catch { failed++ }
        }
        return { processed, failed }
      })().finally(() => { processing = undefined })
      return processing
    },
  }
  return service
}

export function billingRoutes(app: Hono, deps: BillingDependencies): void {
  app.get('/api/billing/subscription', async c => {
    const user = await deps.requireUser(c.req.raw)
    const id = requireId(c.req.query('accountId'))
    await deps.authorizeAccount(user.id, id)
    c.header('Cache-Control', 'no-store')
    return c.json(await deps.service.subscription(id))
  })
  app.post('/api/billing/checkout', async c => {
    const user = await deps.requireUser(c.req.raw)
    await deps.assertCsrf(c.req.raw)
    const body = object(await c.req.json().catch(() => { throw new CloudError(400, 'invalid-input') }))
    const id = requireId(body.accountId)
    await deps.authorizeAccount(user.id, id)
    c.header('Cache-Control', 'no-store')
    return c.json(await deps.service.checkout(id, requireText(body.plan), requireText(body.requestId)))
  })
  app.post('/api/billing/portal', async c => {
    const user = await deps.requireUser(c.req.raw)
    await deps.assertCsrf(c.req.raw)
    const body = object(await c.req.json().catch(() => { throw new CloudError(400, 'invalid-input') }))
    const id = requireId(body.accountId)
    await deps.authorizeAccount(user.id, id)
    c.header('Cache-Control', 'no-store')
    return c.json(await deps.service.portal(id))
  })
  app.post('/api/billing/webhook', async c => c.json(await deps.service.acceptWebhook(c.req.raw), 202))
}
