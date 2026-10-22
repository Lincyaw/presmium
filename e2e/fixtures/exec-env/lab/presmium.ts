// The provider of `kind: fixture-lab` environments: at compile time its executor records a
// fixed output for Python; in the browser no plugin registers the environment's executor, so a live
// run of code that names it fails and the recorded output stands in (docs/review-round2.md, decision 5).
const RECORDED = '实验环境中录制的输出\n'

export default {
  id: 'fixture.lab',
  version: '0.1.0',
  kernel: '^1.0.0',
  environments: {
    'fixture-lab': {
      create: (name: string) => ({
        id: `presmium.env.${name}`,
        supports: (lang: string) => lang === 'python',
        fingerprint: () => 'fixture-lab 1',
        run: async () => ({ ok: true, stdout: RECORDED, stderr: '', exitCode: 0, durationMs: 1, timedOut: false, source: 'live', executorId: `presmium.env.${name}`, outputs: [{ output_type: 'stream', name: 'stdout', text: RECORDED }] }),
      }),
      probe: async () => undefined,
    },
  },
}
