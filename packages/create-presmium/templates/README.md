# create-presmium's templates

Packing the package (`prepack`: `scripts/templates.ts`) copies each template here from its one source in
the Presmium repository, as `src/templates.ts` lists them: the document templates
(`packages/workspace/templates/document/`), the workspace (`templates/workspace/`), the plugin
(`templates/plugin/`) and the skills new projects get (`.agents/skills/`). Edit the sources, not these
copies, which git does not keep; `pnpm --filter create-presmium templates` copies them without packing.
