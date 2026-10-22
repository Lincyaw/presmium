export function releaseFocus(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}
