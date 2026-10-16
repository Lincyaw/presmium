// Stands in for the operator plugin installed with the CLI (packages/mcp/test): presmium-mcp loads it from
// the CLI's directory as the CLI does, and its read tool shows that it did. Plain objects; no package needed.
export default {
  id: 'fixture.bundled',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  tools: [
    {
      name: 'fixture_bundled',
      description: 'Answers that the package installed with the CLI was loaded',
      input: { type: 'object', properties: {} },
      kind: 'read',
      run: async () => ({ bundled: true }),
    },
  ],
}
