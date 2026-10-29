const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * The keys shown for the workbench's commands, one form per platform (docs/glossary.md, Undo and Redo): ⌘Z and ⌘⇧Z on
 * Apple devices, Ctrl+Z and Ctrl+Y elsewhere. Both Ctrl+Y and Ctrl+Shift+Z (⌘⇧Z) redo, in the page and in the editor.
 * Key names stay in English in both languages, as on the keys.
 */
export const SHORTCUTS = { ...apple ? { undo: '⌘Z', redo: '⌘⇧Z', save: '⌘S' } : { undo: 'Ctrl+Z', redo: 'Ctrl+Y', save: 'Ctrl+S' }, playPause: 'Space' }
