// Runs git commands for the workspace service, in a small process of its own: starting a child process from the
// service (a large process) held its event loop for tens of milliseconds each time. Messages: { id, args, cwd, env,
// input?, maxBuffer } in, { id, code, stdout, stderr } out. It ends when the service does.
import { execFile } from 'node:child_process'

process.on('message', ({ id, args, cwd, env, input, maxBuffer }) => {
  let inputError
  const child = execFile('git', args, { cwd, env, encoding: 'buffer', maxBuffer }, (error, stdout, stderr) => {
    const code = inputError ? 1 : !error ? 0 : typeof error.code === 'number' ? error.code : 1
    process.send?.({ id, code, stdout, stderr: stderr.toString('utf8') + (inputError?.message ?? '') })
  })
  if (input !== undefined) {
    if (child.stdin) {
      child.stdin.on('error', (error) => { inputError = error; child.kill() })
      child.stdin.end(Buffer.from(input))
    } else { inputError = new Error('git stdin is unavailable'); child.kill() }
  }
})
process.on('disconnect', () => process.exit(0))
