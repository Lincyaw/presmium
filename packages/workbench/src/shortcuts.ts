const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * The keys shown for Undo and Redo, one form per platform (docs/glossary.md, Undo and Redo): ⌘Z and ⌘⇧Z on Apple
 * devices, Ctrl+Z and Ctrl+Y elsewhere. Both Ctrl+Y and Ctrl+Shift+Z (⌘⇧Z) redo, in the page and in the editor.
 */
export const SHORTCUTS = apple ? { undo: '⌘Z', redo: '⌘⇧Z' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Y' }
