import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const target = resolve(process.argv[2] ?? '.presmium/cs336-workspace')
if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} already exists and is not empty`)
cpSync(here, target, { recursive: true, filter: source => !['node_modules', '.presmium', 'dist'].includes(source.split('/').at(-1)) })
symlinkSync(join(here, 'node_modules'), join(target, 'node_modules'), 'junction')
writeFileSync(join(target, '.gitignore'), 'node_modules/\ndist/\n**/.presmium/\n')
// The copy is for editing the course, where the maintainers' import and audit do not belong; an agent working in it reads this.
writeFileSync(join(target, 'AGENTS.md'), `# Stanford CS336: Language Modeling from Scratch (Spring 2026)

An editable copy of Presmium's example course: the 17 lectures of Stanford CS336, converted from the upstream course (README.md).

- \`lecture_NN/lecture.md\` is lecture NN as a document: the reading version, which the workbench shows as a web page and which also gives the lecture's notebook.
- \`lecture_NN/slides.md\` is the same lecture as slides, arranged on its own. It is not one of the workspace's documents: the workbench does not show it, and the document context's diagnostics do not cover it; \`node_modules/.bin/presmium check lecture_NN/slides.md\` checks it.
  - The Python lectures (01, 02, 06, 07, 10, 12, 13, 14, 17) show the original presentation step by step, with the text of the document. When the author changes what a passage says, make the same change where the passage appears in \`slides.md\`, so that the slides say the same.
  - The PDF lectures (03, 04, 05, 08, 09, 11, 15, 16) show the original pages as images, which a change of text does not reach.
- Both files were generated once from \`source/\` (the upstream lectures, their recordings and PDFs) by \`tools/import.py\`, and are now edited directly. Edit \`lecture.md\` and \`slides.md\`; leave \`source/\`, \`tools/\` and \`coverage.json\` as they are. Do not run the import, which would overwrite the edits, or the audit, which compares the files with the upstream snapshot that edits depart from on purpose.
- \`lecture.md\` at the root is the course's table of contents; \`assets/\` holds the images the lectures share.
`)
const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Presmium example', '-c', 'user.email=example@presmium.invalid', '-c', 'commit.gpgSign=false', ...args], { cwd: target, stdio: 'pipe' })
git(['init', '-q', '-b', 'main'])
git(['add', '-A'])
git(['commit', '-q', '-m', 'Stanford CS336: complete Spring 2026 course'])
console.log(`CS336 workspace: ${target}`)
