// Test-only operator plugin of packages/workspace/test/agent-host.test.ts: `AGENT_RUNTIME` is the assistant's own
// (its ACP client), whose agent is the scripted test agent as a replacement runtime runs it in LOCAL mode (the
// command in SCRIPTED_AGENT_COMMAND of the process's environment). In agent-host, which runs only the bundled
// DeepSeek Harness otherwise, the test sees what agent-host does with a session: its directory, its limit, the
// cancel of a prompt whose caller went away.
import assistant from '@presmium/slidev-addon-assistant/presmium'

type Context = Parameters<NonNullable<typeof assistant.services>>[0]

const replacement: Record<string, string | undefined> = {
  PRESMIUM_AGENT_COMMAND: process.env.SCRIPTED_AGENT_COMMAND,
  PRESMIUM_AGENT_PROVIDER: 'Test Provider',
}

export default {
  id: 'fixture.scripted-runtime',
  version: '0.1.0',
  kernel: '^0.1.0',
  operator: true,
  services: (ctx: Context) => assistant.services!.call(assistant, { ...ctx, trust: 'local', settings: {}, secret: (name: string) => replacement[name] }),
}
