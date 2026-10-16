/** Types of the compiler's host options that its index does not name. */
import type { CompilerOptions } from '@presmium/compiler'

/** The compiler's execution options (docs/architecture.md 4.6, 10.6). */
export type ExecutionOptions = NonNullable<CompilerOptions['execution']>
/** A run the cache did not answer, as `admit` sees it. */
export type PendingRun = Parameters<NonNullable<ExecutionOptions['admit']>>[0][number]
/** Runs handed elsewhere: in SHARED mode, to agent-host. */
export type RemoteExecution = NonNullable<ExecutionOptions['remote']>
