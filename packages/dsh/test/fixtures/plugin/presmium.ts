// The test plugin of packages/dsh/test: an agent tool (`AgentTool`) of the documents that list it, which MCP
// lists and the bundle registers as `presmium__fixture_note` (G-3). Plain objects: the fixture needs no package.
export default {
  id: 'fixture.dsh',
  version: '0.1.0',
  kernel: '^1.0.0',
  tools: [
    {
      name: 'fixture_note',
      description: 'Notes a word for the test, with the document of the call',
      input: { type: 'object', properties: { word: { type: 'string', description: 'The word to note' } }, required: ['word'] },
      kind: 'read',
      run: async (input: { word: string }, ctx: { document: string }) => ({ noted: input.word, document: ctx.document }),
    },
  ],
}
