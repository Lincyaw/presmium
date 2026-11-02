import type { SkillErrorCode } from './resources.ts'

interface SkillMessages {
  usage: string
  installed(installed: number, skipped: number, updated: number): string
  errors: Record<SkillErrorCode, string>
  usageError: string
}

export const MESSAGES: Record<'zh-CN' | 'en', SkillMessages> = {
  'zh-CN': {
    usage: '用法：presmium skills install <目录> [--name <技能>] [--update] [--json]\n\n将缺少的 Presmium 技能安装到项目的 .agents/skills；已有内容保持不变。\n加 --update 时，把已有的技能目录换成这个版本的技能（例如升级 Presmium 之后）；链接与文件仍然保留。\n',
    installed: (installed, skipped, updated) => `已安装 ${installed} 项技能，${updated ? `更新 ${updated} 项，` : ''}保留 ${skipped} 项已有技能。`,
    usageError: '请使用 install <目录>，或通过 --help 查看用法。',
    errors: {
      'skill-not-found': '没有这项内置技能。请从技能目录中选择。',
      'skill-path-invalid': '技能文件路径不安全。请使用技能目录中的相对路径。',
      'skill-file-unavailable': '无法读取这份技能文本。请查看技能的文件清单。',
      'skill-page-invalid': '读取范围无效。起点需为非负整数，每页需为 1 到 12000 个字符。',
      'skill-project-invalid': '工作区不存在或不是目录。请指定已有工作区。',
      'skill-install-unsafe': '无法安全安装技能。请检查项目的 .agents/skills 目录及其权限。',
      'skill-install-cancelled': '技能安装已取消。',
      'skill-unavailable': '内置技能资源不可用。请重新安装 Presmium。',
    },
  },
  en: {
    usage: 'Usage: presmium skills install <directory> [--name <skill>] [--update] [--json]\n\nInstall missing Presmium skills in the project’s .agents/skills; existing entries are preserved.\nWith --update, existing skill directories are replaced with this version’s skills (after upgrading Presmium, for example); links and files are still preserved.\n',
    installed: (installed, skipped, updated) => `Installed ${installed} skills${updated ? `, updated ${updated}` : ''}; preserved ${skipped} existing skills.`,
    usageError: 'Use install <directory>, or --help for usage.',
    errors: {
      'skill-not-found': 'This bundled skill does not exist. Choose one from the skill catalog.',
      'skill-path-invalid': 'The skill file path is unsafe. Use a relative path from the skill catalog.',
      'skill-file-unavailable': 'This skill text cannot be read. Check the skill’s file list.',
      'skill-page-invalid': 'The read range is invalid. Use a non-negative integer offset and 1 to 12000 characters per page.',
      'skill-project-invalid': 'The project directory is missing or is not a directory. Choose an existing project.',
      'skill-install-unsafe': 'The skills cannot be installed safely. Check the project’s .agents/skills directory and its permissions.',
      'skill-install-cancelled': 'Skill installation was canceled.',
      'skill-unavailable': 'The bundled skill resources are unavailable. Reinstall Presmium.',
    },
  },
}
