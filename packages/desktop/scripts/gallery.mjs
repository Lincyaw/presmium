// A self-contained source snapshot for the installer's first workspace.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../..', import.meta.url))

export function gallery(target) {
  const source = join(root, 'examples/gallery')
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, {
    recursive: true,
    dereference: true,
    filter: file => {
      const parts = relative(source, file).split(sep)
      if (parts.some(part => ['node_modules', 'dist', '.git', '.DS_Store'].includes(part))) return false
      const cache = parts.indexOf('.presmium')
      return cache === -1 || cache === parts.length - 1 || ['speech', 'speech.lock.json'].includes(parts[cache + 1])
    },
  })
  rmSync(join(target, 'try.mjs'))
  // Workspace protocols and repository-relative commands cannot be used outside the checkout.
  const versions = new Map(readdirSync(join(root, 'packages')).flatMap(dir => {
    const manifest = join(root, 'packages', dir, 'package.json')
    if (!existsSync(manifest)) return []
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    return [[pkg.name, pkg.version]]
  }))
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (version.startsWith('workspace:')) {
      if (!versions.has(name)) throw new Error(`Missing gallery dependency: ${name}`)
      pkg.dependencies[name] = versions.get(name)
    }
  }
  writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  const tsconfig = JSON.parse(readFileSync(join(target, 'tsconfig.json'), 'utf8'))
  const base = JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf8'))
  delete tsconfig.extends
  writeFileSync(join(target, 'tsconfig.json'), JSON.stringify({ ...base, ...tsconfig,
    compilerOptions: { ...base.compilerOptions, ...tsconfig.compilerOptions },
  }, null, 2) + '\n')
  const course = join(target, 'tools/course.mjs')
  writeFileSync(course, readFileSync(course, 'utf8')
    .replace("const cli = fileURLToPath(new URL('../../../packages/cli/bin/presmium.mjs', import.meta.url))\n", '')
    .replace("execFileSync(process.execPath, [cli, ...args]", "execFileSync('presmium', args"))
  const readme = join(target, 'README.md')
  writeFileSync(readme, readFileSync(readme, 'utf8').split('## 使用')[0] + `## 使用

这是桌面版首次启动时准备的示例工作区。选择一份文稿即可编辑、预览和放映；修改只保存在这份副本中。以后启动继续打开上次的工作区，应用升级不会覆盖这里的内容。通过“工作区 → 打开工作区…”可切换到自己的目录。

This editable gallery is prepared on the desktop app's first launch. Open a document to edit, preview or present it. Your changes stay in this copy; app updates preserve them. Later launches reopen the last workspace. Use Workspace → Open Workspace… to switch folders.
`)
  writeFileSync(join(target, '.gitignore'), readFileSync(join(target, '.gitignore'), 'utf8') + '\nnode_modules\ndist/\n**/.presmium/*\n!**/.presmium/speech/\n!**/.presmium/speech.lock.json\n')
  // Carry the baseline history with the examples: first launch needs no git command to copy them.
  const hooks = join(target, '.git-hooks-disabled')
  mkdirSync(hooks)
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)))
  const git = args => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false', '-c', 'user.name=Presmium examples', '-c', 'user.email=examples@presmium.invalid', '-c', 'commit.gpgSign=false', ...args], { cwd: target, env, stdio: 'pipe' })
  git(['init', '-q', '-b', 'main'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'Presmium example workspace'])
  rmSync(hooks, { recursive: true })
}
