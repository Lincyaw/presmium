/**
 * The compute request of a WGSL shader and the run panel's `:params:`
 * (docs/ir.md 2.7): `buffers` gives each buffer the shader declares its data
 * or size, by the name of the shader's variable, so the group, binding,
 * storage access and value type come from the declaration; `dispatch` the
 * workgroups (1 to 3 numbers, default 1), `entry` the entry point (default:
 * the shader's only compute entry point), `repeat` how many times the
 * shader runs on the same buffers (default 1, the timing is the median),
 * `features` the adapter features it needs.
 *
 * ```yaml
 * buffers:
 *   a: [1, 2, 3, 4]           # data; the type comes from array<f32>
 *   b: { data: [10, 20, 30, 40] }
 *   out: { size: 4 }          # 4 values, initially 0 (`fill` sets another value)
 * dispatch: 1
 * ```
 *
 * Writable storage buffers are read back and shown (`read` says otherwise).
 * The run panel passes each value of `:params:` as a string (YAML; JSON for
 * lists and mappings), as learners edit them in its form.
 */
import { parse } from 'yaml'
import type { ComputeBuffer, ComputeRequest, ScalarType } from './compute.ts'
import { LIMITS } from './config.ts'
import type { WebgpuMessages } from './messages.ts'

const KEYS = ['buffers', 'dispatch', 'entry', 'repeat', 'features']
const TYPES = ['f32', 'i32', 'u32']
/** A buffer declaration: its attributes, address space, access, name and type. */
const DECLARATION = /((?:@\s*\w+\s*(?:\([^)]*\))?\s*)+)var\s*<\s*(storage|uniform)\s*(?:,\s*(read_write|read))?\s*>\s*([A-Za-z_]\w*)\s*:\s*([^;]+);/g
const SHORTHAND: Record<string, string> = { f: 'f32', i: 'i32', u: 'u32', h: 'f16' }

interface Declaration {
  name: string
  group: number
  binding: number
  usage: 'storage' | 'uniform'
  access: 'read' | 'read_write'
  /** The scalar type its type is made of, when there is one (not a struct). */
  scalar?: string
}

/** The buffers a shader declares (comments removed first). */
export function declarations(code: string): Declaration[] {
  const source = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return [...source.matchAll(DECLARATION)].map(([, attributes, space, access, name, type]) => {
    const attribute = (key: string) => Number(new RegExp(`@\\s*${key}\\s*\\(\\s*(\\d+)\\s*\\)`).exec(attributes!)?.[1] ?? 0)
    const scalars = new Set([
      ...[...type!.matchAll(/\b(f32|i32|u32|f16)\b/g)].map(m => m[1]!),
      ...[...type!.matchAll(/\b(?:vec[234]|mat[234]x[234])([fiuh])\b/g)].map(m => SHORTHAND[m[1]!]!),
    ])
    return {
      name: name!,
      group: attribute('group'),
      binding: attribute('binding'),
      usage: space as 'storage' | 'uniform',
      access: space === 'storage' && access === 'read_write' ? 'read_write' : 'read',
      scalar: scalars.size === 1 ? [...scalars][0] : undefined,
    }
  })
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: unknown, max = Infinity): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max

/** Bytes a buffer takes on the GPU (as the compute core allocates it). */
function bytes(buffer: Pick<ComputeBuffer, 'length' | 'usage'>): number {
  const size = Math.max(4, buffer.length * 4)
  return buffer.usage === 'uniform' ? Math.ceil(size / 16) * 16 : size
}

function buffer(declaration: Declaration, spec: unknown, text: WebgpuMessages): ComputeBuffer | string {
  const { name } = declaration
  const fields = Array.isArray(spec) ? { data: spec } : spec
  if (!isRecord(fields)) return text.bufferShape(name)
  const { data, size, fill, type, read } = fields
  if (data !== undefined && !(Array.isArray(data) && data.every(isNumber))) return text.bufferShape(name)
  if (size !== undefined && !positive(size)) return text.bufferShape(name)
  if ((fill !== undefined && !isNumber(fill)) || (read !== undefined && typeof read !== 'boolean')) return text.bufferShape(name)
  const scalar = typeof type === 'string' ? type : declaration.scalar ?? 'f32'
  if (!TYPES.includes(scalar)) return text.unsupportedType(name, scalar)
  const values = data as number[] | undefined
  const length = Math.max(size as number | undefined ?? 0, values?.length ?? 0)
  if (length === 0) return text.bufferSize(name)
  return {
    name,
    group: declaration.group,
    binding: declaration.binding,
    usage: declaration.usage,
    access: declaration.access,
    type: scalar as ScalarType,
    length,
    ...values ? { data: values } : {},
    ...fill !== undefined ? { fill: fill as number } : {},
    read: read ?? declaration.access === 'read_write',
  }
}

/**
 * The request of a shader with the arguments of its run (`RunRequest.args`),
 * or the error that keeps it from running, in the language of `text`.
 */
export function computeRequest(code: string, args: Record<string, string> | undefined, text: WebgpuMessages): { request: ComputeRequest } | { error: string } {
  const params: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(args ?? {})) {
    if (!KEYS.includes(name)) return { error: text.unknownParam(name) }
    try {
      params[name] = parse(raw)
    } catch (error) {
      return { error: text.notYaml(name, error instanceof Error ? error.message.split('\n')[0]! : String(error)) }
    }
  }

  const specs = params.buffers
  if (!isRecord(specs)) return { error: text.noBuffers }
  const declared = declarations(code)
  for (const name of Object.keys(specs)) {
    if (!declared.some(d => d.name === name)) return { error: text.noDeclaration(name) }
  }
  const buffers: ComputeBuffer[] = []
  for (const declaration of declared) {
    if (!(declaration.name in specs)) return { error: text.noBuffer(declaration.name) }
    const made = buffer(declaration, specs[declaration.name], text)
    if (typeof made === 'string') return { error: made }
    buffers.push(made)
  }

  const dispatch = params.dispatch === undefined ? [1] : Array.isArray(params.dispatch) ? params.dispatch : [params.dispatch]
  if (dispatch.length < 1 || dispatch.length > 3 || !dispatch.every(n => positive(n))) return { error: text.badDispatch }
  const repeat = params.repeat ?? 1
  if (!positive(repeat, LIMITS.maxRepeat)) return { error: text.badRepeat(LIMITS.maxRepeat) }
  const features = params.features ?? []
  if (!Array.isArray(features) || !features.every(f => typeof f === 'string')) return { error: text.badFeatures }
  if (params.entry !== undefined && typeof params.entry !== 'string') return { error: text.badEntry }
  const total = buffers.reduce((sum, b) => sum + bytes(b), 0)
  if (total > LIMITS.maxBytes) return { error: text.tooLarge(total, LIMITS.maxBytes) }

  const [x, y = 1, z = 1] = dispatch as number[]
  return {
    request: {
      code,
      ...params.entry ? { entry: params.entry as string } : {},
      buffers,
      dispatch: [x!, y, z],
      repeat,
      features: features as string[],
    },
  }
}
