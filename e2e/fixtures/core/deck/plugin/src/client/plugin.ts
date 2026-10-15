/**
 * Kernel plugins whose start the tests read in the start report of both forms:
 * one written for another kernel, one whose setup throws, two that require
 * each other's service, and one that starts, notes the UI language it starts
 * in and, when the page goes away, counts its disposal in localStorage. One
 * more plays another device: a sync transport that the tests drive through
 * `window.fixtureDevice`. Plain objects (a service token is `{ id }`), so the
 * fixture needs no package of its own to compile.
 */
const kernel = '^0.1.0'
const version = '0.1.0'
const A = Object.freeze({ id: 'fixture.core.a' })
const B = Object.freeze({ id: 'fixture.core.b' })
const SYNC_TRANSPORTS = Object.freeze({ id: 'presmium.syncTransports' })

/** localStorage key of the number of disposals of `fixture.core.lifecycle`. */
export const DISPOSALS = 'fixture.core.disposals'

type Receive = (patch: Record<string, unknown>) => void
type Publish = (state: Record<string, unknown>, fromRemote: boolean) => void

/** Another device on the 'remote' shared state `fixture.core.remote`: what this window published to it, and a way to send it a change. */
interface Device {
  published: { value: unknown, fromRemote: boolean }[]
  receive: Receive
}

declare global {
  interface Window {
    fixtureDevice?: Device
    /** `<html lang>` when the kernel started the plugins. */
    fixtureLang?: string
  }
}

export default [
  { manifest: { id: 'fixture.core.future', version, kernel: '^9.0.0' }, setup() {} },
  {
    manifest: { id: 'fixture.core.throws', version, kernel },
    setup() {
      throw new Error('fixture setup failed on purpose')
    },
  },
  {
    manifest: { id: 'fixture.core.cycle-a', version, kernel, provides: [A], requires: [{ token: B }] },
    setup(ctx: { provide(token: unknown, impl: unknown): void }) {
      ctx.provide(A, 'a')
    },
  },
  {
    manifest: { id: 'fixture.core.cycle-b', version, kernel, provides: [B], requires: [{ token: A }] },
    setup(ctx: { provide(token: unknown, impl: unknown): void }) {
      ctx.provide(B, 'b')
    },
  },
  {
    manifest: { id: 'fixture.core.device', version, kernel, requires: [{ token: SYNC_TRANSPORTS }] },
    setup(ctx: { get(token: unknown): { add(transport: unknown): unknown } }) {
      ctx.get(SYNC_TRANSPORTS).add({
        connect(channel: string, receive: Receive): Publish | undefined {
          if (!channel.endsWith('remote:fixture.core.remote')) return undefined
          const device: Device = { published: [], receive }
          window.fixtureDevice = device
          return (state, fromRemote) => device.published.push({ value: state.value, fromRemote })
        },
      })
    },
  },
  {
    manifest: { id: 'fixture.core.lifecycle', version, kernel },
    setup() {
      window.fixtureLang = document.documentElement.lang
    },
    dispose() {
      localStorage.setItem(DISPOSALS, String(Number(localStorage.getItem(DISPOSALS) ?? 0) + 1))
    },
  },
]
