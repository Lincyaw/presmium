import { defineComponent, h, onErrorCaptured, shallowRef } from 'vue'

export interface ComponentError {
  component: string
  message: string
}

const caughtErrors = shallowRef<readonly ComponentError[]>([])

/** Errors caught by `PmBoundary` in this view (reactive); the presenter view lists them. */
export function componentErrors(): readonly ComponentError[] {
  return caughtErrors.value
}

function record(error: ComponentError): void {
  const known = caughtErrors.value.some(e => e.component === error.component && e.message === error.message)
  if (!known) caughtErrors.value = [...caughtErrors.value, error]
}

/**
 * Error boundary for plugin components (K-07). An error thrown while rendering
 * its content replaces the content with a placeholder; the rest of the slide
 * keeps rendering.
 */
export const PmBoundary = defineComponent({
  name: 'PmBoundary',
  props: {
    /** Shown in the placeholder and the presenter view. */
    name: { type: String, default: 'component' },
  },
  setup(props, { slots }) {
    const failed = shallowRef<ComponentError>()
    onErrorCaptured((error) => {
      failed.value = { component: props.name, message: error instanceof Error ? error.message : String(error) }
      record(failed.value)
      console.error(`[presmium] ${props.name} failed`, error)
      return false
    })
    return () => failed.value
      ? h('div', { 'class': 'pm-boundary-error', 'role': 'alert', 'data-pm-error': failed.value.component }, [
          `${failed.value.component} 出错：${failed.value.message}`,
        ])
      : slots.default?.()
  },
})
