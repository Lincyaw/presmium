/**
 * <presmium-demo-counter label="…" start="…">: a button that counts its clicks, a web component
 * written with the DOM's own API. Tags that start with `presmium-` are custom elements to the slides
 * form (@lincyaw/addon-content's React options), so the deck can write it as it is.
 */
const TAG = 'presmium-demo-counter'

class DemoCounter extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return
    const shadow = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `
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
    `
    const button = document.createElement('button')
    button.type = 'button'
    button.part.add('button')
    const output = document.createElement('output')
    let count = Number(this.getAttribute('start') ?? 0) || 0
    output.textContent = String(count)
    const colon = document.documentElement.lang.startsWith('zh') ? '：' : ': '
    button.append(`${this.getAttribute('label') ?? 'Count'}${colon}`, output)
    button.addEventListener('click', () => {
      output.textContent = String(++count)
    })
    shadow.append(style, button)
  }
}

export function defineCounter(): void {
  if (typeof customElements === 'undefined' || customElements.get(TAG)) return
  customElements.define(TAG, DemoCounter)
}
