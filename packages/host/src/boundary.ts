import { errorMessage } from '@presmium/kernel'
import { defineComponent, h, onBeforeUnmount, onErrorCaptured, shallowRef, watch } from 'vue'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'

export interface ComponentError {
  component: string
  message: string
}

/** The errors each boundary holds, so a boundary that recovers takes its own back. */
const caughtErrors = shallowRef<ReadonlyMap<object, ComponentError>>(new Map())

/** Errors caught by `PmBoundary` in this view (reactive); the presenter view lists them. */
export function componentErrors(): readonly ComponentError[] {
  const errors: ComponentError[] = []
  for (const error of caughtErrors.value.values()) {
    if (!errors.some(e => e.component === error.component && e.message === error.message)) errors.push(error)
  }
  return errors
}

function hold(owner: object, error: ComponentError | undefined): void {
  if (!error && !caughtErrors.value.has(owner)) return
  const next = new Map(caughtErrors.value)
  if (error) next.set(owner, error)
  else next.delete(owner)
  caughtErrors.value = next
}

/**
 * Error boundary for plugin components (K-07). An error thrown while rendering
 * its content replaces the content with a placeholder; the rest of the slide
 * keeps rendering. The renderers put each plugin component in one. When
 * `resetKey` changes (e.g. the component's props after a live update, or the
 * step), the boundary renders its content again and forgets the error.
 */
export const PmBoundary = defineComponent({
  name: 'PmBoundary',
  props: {
    /** Shown in the placeholder and the presenter view. */
    name: { type: String, default: 'component' },
    /** A new value renders the content again after an error. */
    resetKey: { type: [String, Number], default: undefined },
  },
  setup(props, { slots }) {
    const t = useMessages(HOST_MESSAGES)
    const owner = {}
    const failed = shallowRef<ComponentError>()
    onErrorCaptured((error) => {
      failed.value = { component: props.name, message: errorMessage(error) }
      hold(owner, failed.value)
      console.error(`[presmium] ${props.name} failed`, error)
      return false
    })
    watch(() => props.resetKey, () => {
      failed.value = undefined
      hold(owner, undefined)
    })
    onBeforeUnmount(() => hold(owner, undefined))
    return () => failed.value
      ? h('div', { 'class': 'pm-boundary-error', 'role': 'alert', 'data-pm-error': failed.value.component }, [
          t.value.componentError(failed.value.component, failed.value.message),
        ])
      : slots.default?.()
  },
})
