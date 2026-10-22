const NAMES: Record<string, string> = {
  'python': 'Python',
  'py': 'Python',
  'python3': 'Python',
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'wgsl': 'WGSL',
  'c': 'C',
  'cpp': 'C++',
  'c++': 'C++',
  'ruby': 'Ruby',
  'rb': 'Ruby',
  'sql': 'SQL',
  'r': 'R',
  'julia': 'Julia',
  'bash': 'Bash',
  'sh': 'Shell',
  'shell': 'Shell',
}

export function languageName(lang: string): string {
  return NAMES[lang.toLowerCase()] ?? lang
}

export function seconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? s.toFixed(2) : s < 100 ? s.toFixed(1) : String(Math.round(s))
}
