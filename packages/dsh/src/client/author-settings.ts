import { AUTHOR_DEFAULTS, TECHNICAL_SETTINGS } from './contract.ts'

const Hidden = () => null

/**
 * Gives an author the workbench's defaults for Harness's display preferences and keeps Harness's technical rows out of
 * Settings → General.
 *
 * The defaults are saved through Harness's settings forms, in the profile's own layer, for each field the author has not
 * chosen yet; a launch patch would outrank that layer and make the forms refuse the author's later choices.
 *
 * While the coding view (`ui-settings.enabled`) is off, each technical row is shadowed by an empty cell under its own id,
 * the slots' public way to replace a shipped cell. Turning the coding view on removes the shadows and the rows come back.
 */
export function registerAuthorSettings(ctx: DshClientContext): void {
  ctx.inject(['configForms'], inner => {
    for (const [namespace, defaults] of Object.entries(AUTHOR_DEFAULTS)) {
      inner.effect(() => inner.configForms.whileServed([namespace], () => {
        const form = inner.configForms.get(namespace)
        let seeded = false
        const seed = () => {
          const snapshot = form.getSnapshot()
          if (seeded || snapshot.status !== 'ready' || !snapshot.writable || snapshot.revision === undefined) return
          seeded = true
          const chosen = (snapshot.user ?? {}) as Record<string, unknown>
          void (async () => {
            for (const [field, value] of Object.entries(defaults)) {
              if (!(field in chosen)) await form.set(field, value).catch(() => false)
            }
          })()
        }
        const off = form.subscribe(seed)
        seed()
        return off
      }), `presmium: author defaults for ${namespace}`)
    }
    const { slot, ids } = TECHNICAL_SETTINGS
    inner.effect(() => inner.slots.inject(slot, () => {
      const enabled = inner.configForms.developerTools.enabled
      let shadows: (() => void)[] = []
      const update = () => {
        if (enabled.getSnapshot()) {
          for (const shadow of shadows) shadow()
          shadows = []
        } else if (!shadows.length) {
          shadows = ids.map(id => inner.slots.register({ name: slot, id, priority: -1 }, Hidden))
        }
      }
      update()
      const off = enabled.subscribe(update)
      return () => {
        off()
        for (const shadow of shadows) shadow()
      }
    }), 'presmium: technical settings behind the coding view')
  })
}
