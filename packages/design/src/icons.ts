import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleHelp, CircleX, Columns2, Contrast, Copy, Download, ExternalLink, Eye, FileDiff, FileOutput, FileText, Film, Folder, Globe, GitBranch, GitFork, History, Info, MessageSquare, MessageSquarePlus, MessagesSquare, Moon, MoreHorizontal, PanelLeft, PanelLeftClose, Pause, Pencil, PenLine, Play, Plug, Plus, Presentation, Redo2, Save, Search, SlidersHorizontal, Sparkles, Sun, Trash2, TriangleAlert, Undo2, Users, X } from 'lucide'
import type { IconNode } from 'lucide'

// Presmium's semantic names stay stable across the Vue and React components and the generated HTML.
export const ICONS = {
  document: FileText, diff: FileDiff, search: Search, history: GitFork, people: Users, help: CircleHelp,
  sliders: SlidersHorizontal, plus: Plus, sparkle: Sparkles, edit: Pencil, close: X,
  copy: Copy, check: Check, branch: GitBranch, 'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft, 'chevron-down': ChevronDown, folder: Folder,
  undo: Undo2, redo: Redo2, sun: Sun, moon: Moon, more: MoreHorizontal,
  slides: Presentation, external: ExternalLink, trash: Trash2, play: Play, pause: Pause,
  warning: TriangleAlert, error: CircleX, info: Info, contrast: Contrast,
  record: Circle, plug: Plug, 'arrow-left': ArrowLeft,
  split: Columns2, 'merge-panels': PanelLeftClose, save: Save, preview: Presentation,
  comment: MessageSquare, 'comment-add': MessageSquarePlus, chat: MessagesSquare, versions: History,
  eye: Eye, 'edit-text': PenLine, resolved: CircleCheck, navigation: PanelLeft,
  export: FileOutput, download: Download, video: Film, website: Globe, notebook: BookOpen,
} satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

export function iconMarkup(name: IconName, size = '1em', strokeWidth = 1.7): string {
  const shapes = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')
  return `<svg class="pm-ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`
}
