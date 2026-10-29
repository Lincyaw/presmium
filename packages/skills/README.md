# @lincyaw/skills

The bundled `presmium-author`, `presmium-animate`, `presmium-present` and `presmium-develop` skills, with their references and animation gallery text. Their authority is the repository’s `.agents/skills`; packaging generates this package’s `skills/` resources and index.

`listBundledSkills()` returns names, descriptions and relative file lists. `readBundledSkill({ name, path, offset, limit })` reads at most 12,000 Unicode characters and returns the next offset, package version and file SHA-256. `skillDirectory(name)` supplies a resource base to a host integration. Unsafe paths and unavailable files raise `SkillError` with a stable code.

`installBundledSkills(projectDir, { names, signal })` adds missing skills under `.agents/skills`. Existing entries and symbolic links are preserved; linked parent directories are refused. Cancellation removes only the incomplete files created by that installation.

```sh
pnpm exec presmium skills install . --json
```

The command returns `{ "installed": [], "skipped": [] }` with the applicable skill names. Omit `--json` for a message in the system language.
