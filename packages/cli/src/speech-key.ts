import { join } from 'node:path'
import { findWorkspaceRoot, operatorDir } from '@lincyaw/compiler'
import { OperatorSpeechSettings, SpeechSettingsError } from '@lincyaw/kernel/node'
import type { CliMessages } from './messages.ts'

const KEY_VARIABLE = 'PRESMIUM_SPEECH_VOLCENGINE_KEY'

export class SpeechKeyFailure extends Error {}

/** A key typed at the terminal is not echoed; from a pipe or a file the whole input is the key. */
async function readKey(prompt: string, cancelled: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    return Buffer.concat(chunks).toString('utf8').trim()
  }
  process.stderr.write(prompt)
  input.setRawMode(true)
  input.setEncoding('utf8')
  input.resume()
  return new Promise<string>((resolve, reject) => {
    let value = ''
    const finish = (error?: Error) => {
      input.off('data', typed)
      input.setRawMode(false)
      input.pause()
      process.stderr.write('\n')
      if (error) reject(error)
      else resolve(value.trim())
    }
    const typed = (text: string) => {
      for (const char of text) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish()
        if (char === '\u0003') return finish(new SpeechKeyFailure(cancelled))
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    input.on('data', typed)
  })
}

/** `presmium speech key set|clear|status [<workspace>]`, on the file the Studio's Settings → Voice Service writes. */
export async function runSpeechKey(action: 'set' | 'clear' | 'status', dir: string, t: CliMessages, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const root = await findWorkspaceRoot(dir)
  const operator = operatorDir(root, env.PRESMIUM_OPERATOR_DIR)
  const file = join(operator, 'speech', 'credentials.json')
  const settings = new OperatorSpeechSettings(operator, name => env[name])
  const failure = (error: unknown) => error instanceof SpeechSettingsError ? new SpeechKeyFailure(t.speechKeyErrors[error.code](file)) : error
  try {
    process.stdout.write(`${t.speechKeyLabels.workspace}  ${root}\n`)
    if (action === 'status') {
      const state = settings.read()
      process.stdout.write(`${t.speechKeyLabels.key}  ${state.source === 'saved' ? t.speechKeySaved(state.appIdConfigured === true) : state.source === 'environment' ? t.speechKeyEnvironment(KEY_VARIABLE) : t.speechKeyNone(KEY_VARIABLE)}\n`)
      if (state.source === 'saved') process.stdout.write(`${t.speechKeyLabels.file}  ${file}\n`)
      return 0
    }
    if (action === 'set') {
      const key = await readKey(t.speechKeyPrompt, t.speechKeyCancelled)
      if (!key) throw new SpeechKeyFailure(t.speechKeyEmpty)
      const saved = await settings.change({ action: 'save', revision: settings.read().revision, apiKey: key })
      if (!saved.stored) throw new SpeechKeyFailure(t.speechKeyErrors['speech-settings-unavailable'](file))
      process.stdout.write(`${t.speechKeyStored(file)}\n`)
      return 0
    }
    const cleared = await settings.change({ action: 'clear', revision: settings.read().revision })
    process.stdout.write(`${cleared.source === 'environment' ? t.speechKeyClearedEnvironment(KEY_VARIABLE) : t.speechKeyCleared}\n`)
    return 0
  } catch (error) {
    throw failure(error)
  }
}
