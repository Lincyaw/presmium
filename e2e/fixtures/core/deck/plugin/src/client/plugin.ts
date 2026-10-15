/**
 * Kernel plugins whose start the tests read in the start report of both forms:
 * one written for another kernel, one whose setup throws, two that require
 * each other's service, and one that starts and, when the page goes away,
 * counts its disposal in localStorage. Plain objects (a service token is
 * `{ id }`), so the fixture needs no package of its own to compile.
 */
const kernel = '^0.1.0'
const version = '0.1.0'
const A = Object.freeze({ id: 'fixture.core.a' })
const B = Object.freeze({ id: 'fixture.core.b' })

/** localStorage key of the number of disposals of `fixture.core.lifecycle`. */
export const DISPOSALS = 'fixture.core.disposals'

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
    manifest: { id: 'fixture.core.lifecycle', version, kernel },
    setup() {},
    dispose() {
      localStorage.setItem(DISPOSALS, String(Number(localStorage.getItem(DISPOSALS) ?? 0) + 1))
    },
  },
]
