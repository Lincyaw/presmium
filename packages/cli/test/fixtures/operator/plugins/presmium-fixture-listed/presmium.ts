// Listed in the workspace configuration, not an operator plugin: no deck loads it unless it names it.
export default {
  id: 'fixture.listed',
  version: '0.1.0',
  kernel: '^0.1.0',
  passes: [{ name: 'listed', run(doc: { meta: Record<string, unknown> }) { doc.meta.listed = true } }],
}
