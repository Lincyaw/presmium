import { errorMessage } from '@lincyaw/kernel'
import { defineComponent, h, onBeforeUnmount, onErrorCaptured, shallowRef, watch } from 'vue'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'

export interface ComponentError {
  component: string
  message: string
}

const caughtErrors = shallowRef<ReadonlyMap<object, ComponentError>>(new Map())

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

export const PmBoundary = defineComponent({
  name: 'PmBoundary',
  props: {
    name: { type: String, default: 'component' },
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
