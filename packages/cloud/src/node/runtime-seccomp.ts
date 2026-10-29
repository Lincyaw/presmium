import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CloudError } from '../domain/errors.ts'

export const RUNTIME_SECCOMP_SHA256 = '1056b00d0e3a74caec22ecbd3e14ec1e7bc005e7fcb1bc27140e88c47fae1d69'
let checked: Promise<string> | undefined

/** An operator-owned derivative of Moby's default-deny policy, never tenant input. */
async function policy(): Promise<string> {
  checked ??= (async () => {
    const source = await readFile(new URL('../../seccomp/runtime.json', import.meta.url), 'utf8')
    if (createHash('sha256').update(source).digest('hex') !== RUNTIME_SECCOMP_SHA256) throw new CloudError(503, 'runtime-seccomp-policy-invalid')
    return source
  })()
  return checked
}

export async function runtimeSeccompSecurityOpt(): Promise<string> { return `seccomp=${await policy()}` }
export async function runtimeSeccompDigest(): Promise<string> { await policy(); return RUNTIME_SECCOMP_SHA256 }
