import { SESSION } from '@lincyaw/kernel/contracts'
import type { ApprovalRequest, ServiceToken, Unsubscribe } from '@lincyaw/kernel/contracts'
import { createStore } from './store.ts'
import type { Store } from './store.ts'
import type { Navigation, NavigationPosition, ServerClient, StatusRegistry, ViewRole } from './contracts.ts'
import { clientDocument, clientEventSubscription, documentHeader, pluginRoutePath } from './server.ts'

export interface PendingApproval {
  id: string
  request: ApprovalRequest
}

export interface ApprovalState {
  pending: Store<PendingApproval[]>
  answer(id: string, allow: boolean): Promise<void>
}

const pending = createStore<PendingApproval[]>([])
let answering: (id: string, allow: boolean) => Promise<void> = async () => {}

export const approvals: ApprovalState = {
  pending,
  answer: (id, allow) => answering(id, allow),
}

function roleOf(position: NavigationPosition): ViewRole {
  if (position.view === 'presenter') return 'presenter'
  if (position.view === 'present') return 'audience'
  if (position.view !== undefined) return 'reader'
  return typeof location !== 'undefined' && /\/presenter(?:\/|$)/.test(location.pathname) ? 'presenter' : 'audience'
}

export function connectControl(client: ServerClient, host: {
  navigation: Navigation
  status: StatusRegistry
  service<T>(token: ServiceToken<T>): T | undefined
}): Unsubscribe {
  const { navigation, status } = host
  const document = clientDocument(client)
  const id = Math.random().toString(36).slice(2, 12)
  const control = `${pluginRoutePath(client, 'presmium.server')}control`
  const post = (body: Record<string, unknown>) => fetch(control, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Presmium-Document': documentHeader(document) },
    body: JSON.stringify({ window: id, ...body }),
  }).then(async response => ({ ok: response.ok, status: response.status, text: await response.text() }))
  answering = async (approval, allow) => {
    const response = await post({ type: 'answer', id: approval, allow })
    if (!response.ok) throw new Error(`the server did not take the answer (${response.status})`)
    pending.set(pending.getSnapshot().filter(p => p.id !== approval))
  }
  const subscribe = clientEventSubscription(client)
  const source = subscribe ? undefined : new EventSource(`${control}?window=${id}&document=${documentHeader(document)}`)
  const handlers = new Map<string, (data: string) => void>()
  const on = <T>(event: string, handle: (data: T) => void) => {
    const receive = (data: string) => {
      try {
        handle(JSON.parse(data) as T)
      } catch (error) {
        console.error(`[presmium] control channel: bad ${event} message`, error)
      }
    }
    handlers.set(event, receive)
    source?.addEventListener(event, message => receive((message as MessageEvent<string>).data))
  }
  on<PendingApproval>('approval', (approval) => {
    if (!pending.getSnapshot().some(p => p.id === approval.id)) pending.set([...pending.getSnapshot(), approval])
  })
  on<{ id: string }>('settled', (settled) => {
    pending.set(pending.getSnapshot().filter(p => p.id !== settled.id))
  })
  on<NavigationPosition>('go', position => navigation.go(position))
  on<{ action: 'start' | 'end', name?: string }>('session', ({ action, name }) => {
    const session = host.service(SESSION)
    if (!session) return
    void (action === 'start' ? session.create(name ?? '') : session.end()).catch((error: unknown) => {
      console.error('[presmium] the classroom command failed', error)
    })
  })

  let reported = ''
  const report = () => {
    const position = navigation.position.getSnapshot()
    const summaries = Object.fromEntries(status.list().map((provider) => {
      try {
        return [provider.id, provider.read()]
      } catch {
        return [provider.id, null]
      }
    }))
    const body = JSON.stringify({ position, role: roleOf(position), status: summaries })
    if (body === reported) return
    reported = body
    void post({ type: 'report', ...JSON.parse(body) as Record<string, unknown> }).catch(() => undefined)
  }
  const opened = () => { reported = ''; report() }
  source?.addEventListener('open', opened)
  const stopEvents = subscribe?.({ topic: 'viewer-control', document, window: id }, message => {
    if (message.type === 'open') opened()
    else if (message.type === 'event') handlers.get(message.event)?.(message.data)
  })
  let soon: ReturnType<typeof setTimeout> | undefined
  const stopWatch = navigation.position.subscribe(() => {
    soon ??= setTimeout(() => {
      soon = undefined
      report()
    }, 200)
  })
  const timer = setInterval(report, 1000)
  return () => {
    stopWatch()
    clearTimeout(soon)
    clearInterval(timer)
    stopEvents?.(); source?.close()
    pending.set([])
  }
}
