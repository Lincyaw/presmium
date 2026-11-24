import css from '@lincyaw/design/desktop-scroll.css'

// This script runs in every native frame. It contains only appearance, never DesktopHost or IPC.
function install(): void {
  document.documentElement.setAttribute('data-pm-desktop-scroll', '')
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true })
else install()
