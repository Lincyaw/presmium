// Code nodes as a code reference plugin makes them, without a repository: `{versions}` shows one
// version per step (`+++` between versions), each with its own permalink and lines; `{pinned}` is
// code pinned to a commit that drifted since, with a recorded run that timed out. Plain objects,
// so the fixture needs no package of its own to compile.
interface Input { arg?: string, body: string }

const REPO = 'https://example.com/fixture'

const versions = {
  name: 'versions',
  arg: true,
  body: true,
  toIR(input: Input) {
    const values = input.body.split(/^\+\+\+$/m).map(text => text.trim())
    const variants = values.map((value, k) => ({
      label: `v${k + 1}`,
      value,
      permalink: `${REPO}/v${k + 1}/merge.py#L${10 * k + 1}-L${10 * k + value.split('\n').length}`,
      startLine: 10 * k + 1,
      endLine: 10 * k + value.split('\n').length,
    }))
    const last = variants.at(-1)!
    return {
      node: {
        type: 'code',
        lang: input.arg ?? 'python',
        value: last.value,
        origin: { anchor: 'region:merge.py#merge', file: 'merge.py', startLine: last.startLine, endLine: last.endLine, permalink: last.permalink, status: 'exact' },
        variants,
      },
      span: variants.length - 1,
    }
  },
}

const pinned = {
  name: 'pinned',
  arg: true,
  body: true,
  toIR(input: Input) {
    return {
      node: {
        type: 'code',
        lang: input.arg ?? 'python',
        value: input.body,
        origin: { anchor: 'region:merge.py#count', file: 'merge.py', startLine: 3, endLine: 4, pin: 'c0ffee0123456789', permalink: `${REPO}/c0ffee0/merge.py#L3-L4`, status: 'exact', drift: 'drifted' },
        outputs: [{ ok: false, stdout: '部分输出\n', stderr: '', exitCode: 1, durationMs: 5, timedOut: true, source: 'recorded', executorId: 'fixture', cacheKey: 'fixture-run' }],
      },
    }
  },
}

export default { id: 'fixture.viewer', version: '0.1.0', kernel: '^1.0.0', directives: [versions, pinned] }
