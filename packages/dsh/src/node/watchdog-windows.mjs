import koffi from 'koffi'

/** Enroll this watchdog before spawning: every descendant belongs to this owned, anonymous job. */
export function ownedWindowsJob() {
  const basic = koffi.struct({
    PerProcessUserTimeLimit: 'int64_t', PerJobUserTimeLimit: 'int64_t', LimitFlags: 'uint32_t',
    MinimumWorkingSetSize: 'size_t', MaximumWorkingSetSize: 'size_t', ActiveProcessLimit: 'uint32_t',
    Affinity: 'uintptr_t', PriorityClass: 'uint32_t', SchedulingClass: 'uint32_t',
  })
  const counters = koffi.struct({
    ReadOperationCount: 'uint64_t', WriteOperationCount: 'uint64_t', OtherOperationCount: 'uint64_t',
    ReadTransferCount: 'uint64_t', WriteTransferCount: 'uint64_t', OtherTransferCount: 'uint64_t',
  })
  const extended = koffi.struct({
    BasicLimitInformation: basic, IoInfo: counters, ProcessMemoryLimit: 'size_t', JobMemoryLimit: 'size_t',
    PeakProcessMemoryUsed: 'size_t', PeakJobMemoryUsed: 'size_t',
  })
  const kernel = koffi.load('kernel32.dll')
  const create = kernel.func('__stdcall', 'CreateJobObjectW', 'void *', ['void *', 'str16'])
  const configure = kernel.func('__stdcall', 'SetInformationJobObject', 'int', ['void *', 'int', 'void *', 'uint32_t'])
  const assign = kernel.func('__stdcall', 'AssignProcessToJobObject', 'int', ['void *', 'void *'])
  const current = kernel.func('__stdcall', 'GetCurrentProcess', 'void *', [])
  const terminate = kernel.func('__stdcall', 'TerminateJobObject', 'int', ['void *', 'uint32_t'])
  const close = kernel.func('__stdcall', 'CloseHandle', 'int', ['void *'])
  const lastError = kernel.func('__stdcall', 'GetLastError', 'uint32_t', [])
  const job = create(null, null)
  if (!job) throw new Error(`Cannot create the owned process job (${lastError()})`)
  const fail = () => { const code = lastError(); close(job); throw new Error(`Cannot bind the owned process job (${code})`) }
  const limits = Buffer.alloc(koffi.sizeof(extended))
  // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, with no breakaway or UI restrictions.
  limits.writeUInt32LE(0x2000, koffi.offsetof(extended, 'BasicLimitInformation') + koffi.offsetof(basic, 'LimitFlags'))
  if (!configure(job, 9, limits, limits.length) || !assign(job, current())) fail()
  return () => { if (!terminate(job, 1)) fail() }
}
