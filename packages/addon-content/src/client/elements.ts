import { currentLocale } from '@presmium/host'
import { defineCustomElement, h, ref } from 'vue'
import { DEMO_COUNTER_TAG, MESSAGES } from '../domain/index.ts'

const DemoCounter = defineCustomElement({
  props: {
    label: { type: String },
    start: { type: Number, default: 0 },
  },
  setup(props) {
    const count = ref(props.start)
    return () => h('button', { type: 'button', part: 'button', onClick: () => count.value++ }, [
      `${props.label ?? MESSAGES[currentLocale()].counter}${MESSAGES[currentLocale()].colon}`,
      h('output', count.value),
    ])
  },
  styles: [`
    button {
      font: inherit;
      padding: 0.4em 1em;
      border: 1px solid var(--pm-contrast-border, var(--pm-color-line-strong, currentColor));
      border-radius: var(--pm-radius-control, 0.4em);
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    output { font-weight: 700; color: var(--pm-contrast-fg, var(--pm-color-accent, inherit)); }
  `],
})

export function defineDemoElements(): void {
  if (typeof customElements === 'undefined' || customElements.get(DEMO_COUNTER_TAG)) return
  customElements.define(DEMO_COUNTER_TAG, DemoCounter)
}
