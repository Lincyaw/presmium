import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleHelp, CircleX, Contrast, Copy, ExternalLink, FileText, Folder, GitBranch, GitFork, Info, Moon, MoreHorizontal, Pencil, Play, Plug, Plus, Presentation, Redo2, Search, SlidersHorizontal, Sparkles, Sun, Trash2, TriangleAlert, Undo2, Users, X } from 'lucide'
import type { IconNode } from 'lucide'

export type Shape = IconNode[number]

// Presmium's semantic names stay stable across the Vue, React and generated HTML views.
export const ICONS = {
  document: FileText, search: Search, history: GitFork, people: Users, help: CircleHelp,
  sliders: SlidersHorizontal, plus: Plus, sparkle: Sparkles, edit: Pencil, close: X,
  copy: Copy, check: Check, branch: GitBranch, 'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft, 'chevron-down': ChevronDown, folder: Folder,
  undo: Undo2, redo: Redo2, sun: Sun, moon: Moon, more: MoreHorizontal,
  slides: Presentation, external: ExternalLink, trash: Trash2, play: Play,
  warning: TriangleAlert, error: CircleX, info: Info, contrast: Contrast,
  record: Circle, plug: Plug, 'arrow-left': ArrowLeft,
} satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

export function iconMarkup(name: IconName, size = '1em', strokeWidth = 1.7): string {
  const shapes = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')
  return `<svg class="pm-ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`
}
