import { createHash, randomBytes } from 'node:crypto'
import { allows, planOf } from '../domain/plans.ts'
import type { CloudCapability, CloudRole, Membership } from '../domain/plans.ts'
import { CloudError, requireId, requireInteger, requireText } from '../domain/errors.ts'
import type { Database, Sql } from './database.ts'

export interface SpaceUser { id: string, name: string, email?: string, emailVerified: boolean }
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
const roleOf = (value: unknown): Exclude<CloudRole, 'owner'> => {
  if (value !== 'editor' && value !== 'reader') throw new CloudError(400, 'invalid-role')
  return value
}

export class Spaces {
  readonly db: Database
  readonly publicUrl: string
  constructor(db: Database, publicUrl: string) { this.db = db; this.publicUrl = publicUrl }

  async authorize(userId: string, spaceId: string, capability: CloudCapability = 'read', sql: Sql = this.db): Promise<Membership> {
    requireId(userId); requireId(spaceId)
    const result = await sql.query('SELECT m.*, s.billing_account_id, a.plan FROM memberships m JOIN spaces s ON s.id=m.space_id JOIN billing_accounts a ON a.id=s.billing_account_id WHERE m.space_id=$1 AND m.user_id=$2 FOR SHARE OF m', [spaceId, userId])
    const row = result.rows[0]
    if (!row) throw new CloudError(404, 'space-not-found')
    const member: Membership = { spaceId, userId, role: row.role, canExecute: row.can_execute, canSpend: row.can_spend, billingAccountId: row.billing_account_id, plan: row.plan }
    if (!allows(member, capability)) throw new CloudError(403, 'permission-denied')
    return member
  }

  async ensurePersonal(user: SpaceUser): Promise<void> {
    await this.db.transaction(async sql => {
      await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`cloud.personal:${user.id}`])
      if ((await sql.query('SELECT id FROM spaces WHERE owner_id=$1 AND personal', [user.id])).rowCount) return
      await this.createIn(sql, user, user.name, true)
    })
  }

  async createIn(sql: Sql, user: SpaceUser, name: string, personal = false) {
    const account = (await sql.query('INSERT INTO billing_accounts(owner_id) VALUES($1) RETURNING id', [user.id])).rows[0]!
    const space = (await sql.query('INSERT INTO spaces(name,owner_id,billing_account_id,personal) VALUES($1,$2,$3,$4) RETURNING id,name,billing_account_id AS "billingAccountId"', [requireText(name, 'space-name-required'), user.id, account.id, personal])).rows[0]!
    await sql.query("INSERT INTO memberships(space_id,user_id,role,can_execute,can_spend) VALUES($1,$2,'owner',true,true)", [space.id, user.id])
    await this.audit(sql, space.id, user.id, 'space.created', space.id)
    return { ...space, role: 'owner' as const, plan: 'free' }
  }

  async create(user: SpaceUser, name: string) {
    return this.db.transaction(async sql => {
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id])
      const count = Number((await sql.query('SELECT count(*) FROM spaces WHERE owner_id=$1', [user.id])).rows[0]!.count)
      if (count >= 20) throw new CloudError(429, 'space-limit')
      return this.createIn(sql, user, name)
    })
  }

  async list(userId: string) {
    return (await this.db.query('SELECT s.id,s.name,s.billing_account_id AS "billingAccountId",m.role,m.can_execute AS "canExecute",m.can_spend AS "canSpend",a.plan FROM spaces s JOIN memberships m ON m.space_id=s.id JOIN billing_accounts a ON a.id=s.billing_account_id WHERE m.user_id=$1 ORDER BY s.created_at', [userId])).rows
  }

  async members(userId: string, spaceId: string) {
    await this.authorize(userId, spaceId)
    const members = (await this.db.query('SELECT m.user_id AS "userId",u.name,u.email,m.role,m.can_execute AS "canExecute",m.can_spend AS "canSpend" FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.space_id=$1 ORDER BY m.created_at', [spaceId])).rows
    const owner = members.some(row => row.userId === userId && row.role === 'owner')
    const invitations = owner ? (await this.db.query('SELECT id,email,role,expires_at AS "expiresAt" FROM invitations WHERE space_id=$1 AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at>now()', [spaceId])).rows : []
    return { members, invitations }
  }

  async invite(user: SpaceUser, spaceId: string, input: Record<string, unknown>) {
    const email = requireText(input.email, 'invalid-email', 320).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CloudError(400, 'invalid-email')
    const role = roleOf(input.role), token = randomBytes(32).toString('base64url')
    return this.db.transaction(async sql => {
      const member = await this.authorize(user.id, spaceId, 'manage', sql)
      await sql.query('SELECT id FROM spaces WHERE id=$1 FOR UPDATE', [spaceId])
      await sql.query('UPDATE invitations SET revoked_at=now() WHERE space_id=$1 AND lower(email)=$2 AND accepted_by IS NULL AND revoked_at IS NULL', [spaceId, email])
      const used = Number((await sql.query('SELECT (SELECT count(*) FROM memberships WHERE space_id=$1)+(SELECT count(*) FROM invitations WHERE space_id=$1 AND accepted_by IS NULL AND revoked_at IS NULL AND expires_at>now()) AS count', [spaceId])).rows[0]!.count)
      if (used >= planOf(member.plan).collaborators + 1) throw new CloudError(409, 'collaborator-limit')
      const invitation = (await sql.query("INSERT INTO invitations(space_id,email,role,can_execute,can_spend,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days') RETURNING id,expires_at AS \"expiresAt\"", [spaceId, email, role, role === 'editor' && input.canExecute === true, role === 'editor' && input.canSpend === true, digest(token), user.id])).rows[0]!
      await this.audit(sql, spaceId, user.id, 'member.invited', invitation.id)
      const url = new URL(`/invite/${token}`, this.publicUrl)
      return { ...invitation, url: url.href }
    })
  }

  async accept(user: SpaceUser, token: string) {
    if (!user.email || !user.emailVerified) throw new CloudError(403, 'verified-email-required')
    return this.db.transaction(async sql => {
      const invitation = (await sql.query('SELECT * FROM invitations WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE', [digest(requireText(token))])).rows[0]
      if (!invitation || invitation.email !== user.email!.toLowerCase()) throw new CloudError(404, 'invitation-not-found')
      if (invitation.accepted_by && invitation.accepted_by !== user.id) throw new CloudError(409, 'invitation-used')
      if (invitation.accepted_by) {
        const membership = await sql.query('SELECT 1 FROM memberships WHERE space_id=$1 AND user_id=$2', [invitation.space_id, user.id])
        if (!membership.rowCount) throw new CloudError(409, 'invitation-used')
        return { spaceId: invitation.space_id }
      }
      await sql.query('INSERT INTO memberships(space_id,user_id,role,can_execute,can_spend) VALUES($1,$2,$3,$4,$5) ON CONFLICT(space_id,user_id) DO NOTHING', [invitation.space_id, user.id, invitation.role, invitation.can_execute, invitation.can_spend])
      await sql.query('UPDATE invitations SET accepted_by=$2 WHERE id=$1', [invitation.id, user.id])
      await this.audit(sql, invitation.space_id, user.id, 'member.joined', invitation.id)
      return { spaceId: invitation.space_id }
    })
  }

  async removeMember(userId: string, spaceId: string, removedId: string) {
    requireId(removedId)
    await this.db.transaction(async sql => {
      await this.authorize(userId, spaceId, 'manage', sql)
      const target = (await sql.query('SELECT role FROM memberships WHERE space_id=$1 AND user_id=$2 FOR UPDATE', [spaceId, removedId])).rows[0]
      if (target?.role === 'owner') throw new CloudError(409, 'owner-removal-forbidden')
      await sql.query('DELETE FROM memberships WHERE space_id=$1 AND user_id=$2', [spaceId, removedId])
      await sql.query('UPDATE invitations SET revoked_at=now() WHERE space_id=$1 AND accepted_by=$2 AND revoked_at IS NULL', [spaceId, removedId])
      await sql.query('UPDATE agent_tokens SET revoked_at=now() WHERE space_id=$1 AND user_id=$2 AND revoked_at IS NULL', [spaceId, removedId])
      await this.audit(sql, spaceId, userId, 'member.removed', removedId)
    })
  }

  async revokeInvitation(userId: string, spaceId: string, invitationId: string) {
    requireId(invitationId)
    await this.db.transaction(async sql => {
      await this.authorize(userId, spaceId, 'manage', sql)
      await sql.query('UPDATE invitations SET revoked_at=now() WHERE id=$1 AND space_id=$2', [invitationId, spaceId])
      await this.audit(sql, spaceId, userId, 'invitation.revoked', invitationId)
    })
  }

  async createToken(userId: string, spaceId: string, input: Record<string, unknown>) {
    const name = requireText(input.name), days = requireInteger(input.expiresInDays ?? 30, 'invalid-expiry', 1, 365)
    const scopes = input.scopes
    if (!Array.isArray(scopes) || !scopes.length || scopes.some(scope => !['read', 'write', 'execute', 'spend'].includes(scope))) throw new CloudError(400, 'invalid-scopes')
    const secret = `pmc_${randomBytes(32).toString('base64url')}`
    return this.db.transaction(async sql => {
      const member = await this.authorize(userId, spaceId, 'read', sql)
      if (scopes.some(scope => !allows(member, scope))) throw new CloudError(403, 'permission-denied')
      const count = Number((await sql.query('SELECT count(*) FROM agent_tokens WHERE space_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()', [spaceId, userId])).rows[0]!.count)
      if (count >= 20) throw new CloudError(429, 'token-limit')
      const token = (await sql.query("INSERT INTO agent_tokens(token_hash,space_id,user_id,name,scopes,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 day') RETURNING id,name,scopes,expires_at AS \"expiresAt\"", [digest(secret), spaceId, userId, name, [...new Set(scopes)], days])).rows[0]!
      await this.audit(sql, spaceId, userId, 'token.created', token.id)
      return { ...token, secret, url: new URL(`/mcp/${spaceId}`, this.publicUrl).href }
    })
  }

  async token(secret: string, spaceId: string, capability: CloudCapability) {
    const row = (await this.db.query('SELECT user_id,scopes FROM agent_tokens WHERE token_hash=$1 AND space_id=$2 AND revoked_at IS NULL AND expires_at>now()', [digest(secret), requireId(spaceId)])).rows[0]
    if (!row || !row.scopes.includes(capability)) throw new CloudError(401, 'invalid-token')
    return this.authorize(row.user_id, spaceId, capability)
  }

  async listTokens(userId: string, spaceId: string) {
    await this.authorize(userId, spaceId)
    return (await this.db.query('SELECT id,name,scopes,created_at AS "createdAt",expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM agent_tokens WHERE space_id=$1 AND user_id=$2 ORDER BY created_at DESC', [spaceId, userId])).rows
  }

  async revokeToken(userId: string, spaceId: string, id: string) {
    requireId(id)
    await this.db.transaction(async sql => {
      const member = await this.authorize(userId, spaceId, 'read', sql)
      await sql.query('UPDATE agent_tokens SET revoked_at=now() WHERE id=$1 AND space_id=$2 AND ($3 OR user_id=$4)', [id, spaceId, member.role === 'owner', userId])
      await this.audit(sql, spaceId, userId, 'token.revoked', id)
    })
  }

  async audit(sql: Sql, spaceId: string, userId: string, action: string, target?: string) {
    await sql.query('INSERT INTO audit_events(space_id,user_id,action,target) VALUES($1,$2,$3,$4)', [spaceId, userId, action, target ?? null])
  }
}
