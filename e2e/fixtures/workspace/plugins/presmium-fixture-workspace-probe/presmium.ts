// The inline role {probe} (docs/ir.md 2.8): its children are its content, except `hidden`, which has
// none, so edit mode shows its mark. Plain objects; no package needed.
export default {
  id: 'fixture.probe',
  version: '0.1.0',
  kernel: '^1.0.0',
  roles: [{
    name: 'probe',
    children: (input: { value: string }) => (input.value === 'hidden' ? [] : [{ type: 'strong', children: [{ type: 'text', value: input.value }] }]),
  }],
}
