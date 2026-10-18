// The Node entry: a role without children, `{mark}`, whose mark only the author sees (as a `{cue}`).
export default {
  id: 'fixture.preview',
  version: '0.1.0',
  kernel: '^1.0.0',
  roles: [{ name: 'mark', children: () => [] }],
}
