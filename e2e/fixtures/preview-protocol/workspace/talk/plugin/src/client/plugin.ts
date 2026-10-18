// A kernel plugin whose setup throws: the page's start report lists it as failed, which the preview reports.
export default [
  {
    manifest: { id: 'fixture.preview.throws', version: '0.1.0', kernel: '^1.0.0' },
    setup() {
      throw new Error('fixture.preview fails to start on purpose')
    },
  },
]
