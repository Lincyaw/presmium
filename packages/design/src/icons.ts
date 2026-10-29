import { UserRound, LogOut, Sigma, Captions, Clock3, Layers, ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleHelp, CircleX, Code2, Columns2, Contrast, Copy, Download, ExternalLink, Eye, FileDiff, FileOutput, FileText, Film, Folder, Globe, GitBranch, GitFork, History, GripVertical, Info, Languages, LayoutGrid, LoaderCircle, Maximize2, Menu, MessageSquare, MessageSquarePlus, MessagesSquare, Minimize2, Moon, MoreHorizontal, PanelLeft, PanelLeftClose, Pause, Pencil, PenLine, Play, Plug, Plus, Presentation, Redo2, Save, Search, SlidersHorizontal, Sparkles, Sun, Trash2, TriangleAlert, Undo2, Users, X, Clapperboard, AudioLines, Scissors, Mic, Volume2, Upload, Image, Link, RefreshCw, Minus, Scan, AlignStartVertical, ArrowRightToLine } from 'lucide'
import type { IconNode } from 'lucide'

// Presmium's semantic names stay stable across React components and the generated HTML.
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
  menu: Menu, language: Languages, account: UserRound, logout: LogOut,
  code: Code2, formula: Sigma,
  captions: Captions, timing: Clock3, steps: Layers, loading: LoaderCircle,
  arrange: Clapperboard, audio: AudioLines, scissors: Scissors, microphone: Mic,
  volume: Volume2, upload: Upload, image: Image, link: Link, refresh: RefreshCw,
  minus: Minus, fit: Scan, grip: GripVertical,
  'timing-during': AlignStartVertical, 'timing-after': ArrowRightToLine,
  overview: LayoutGrid, fullscreen: Maximize2, 'exit-fullscreen': Minimize2,
} satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

export function iconMarkup(name: IconName, size = '1em', strokeWidth = 1.7): string {
  const shapes = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')
  return `<svg class="pm-ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`
}
