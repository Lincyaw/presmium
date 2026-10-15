import { defineCustomElement, h, ref } from 'vue'
import { DEMO_COUNTER_TAG } from '../domain/index.ts'

/**
 * Demo web component (P-43): a counter whose state lives in the element, so
 * clicking it shows that an embedded component keeps its own interaction.
 */
const DemoCounter = defineCustomElement({
  props: {
    label: { type: String, default: '计数' },
    start: { type: Number, default: 0 },
  },
  setup(props) {
    const count = ref(props.start)
    return () => h('button', { type: 'button', part: 'button', onClick: () => count.value++ }, [
      `${props.label}：`,
      h('output', count.value),
    ])
  },
  // The shadow root keeps the page's CSS out; the colors of the high-contrast mode (P-52) come in as variables.
  styles: [`
    button {
      font: inherit;
      padding: 0.4em 1em;
      border: 1px solid var(--pm-contrast-border, #0ea5e9);
      border-radius: 0.4em;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    output { font-weight: 700; color: var(--pm-contrast-fg, #0ea5e9); }
  `],
})

/** Defines the demo elements once; a no-op where custom elements are unavailable (server rendering). */
export function defineDemoElements(): void {
  if (typeof customElements === 'undefined' || customElements.get(DEMO_COUNTER_TAG)) return
  customElements.define(DEMO_COUNTER_TAG, DemoCounter)
}
