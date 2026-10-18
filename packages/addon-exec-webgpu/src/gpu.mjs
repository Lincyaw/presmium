const ARRAYS = { f32: Float32Array, i32: Int32Array, u32: Uint32Array }
const ENDS = 4

export function describeAdapter(adapter) {
  const info = adapter.info ?? {}
  const fallback = Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter) || info.architecture === 'swiftshader'
  return { vendor: info.vendor ?? '', architecture: info.architecture ?? '', description: info.description ?? '', fallback }
}

export async function probeAdapter(gpu) {
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
  return adapter ? describeAdapter(adapter) : undefined
}

export function bufferBytes(buffer) {
  const bytes = Math.max(4, buffer.length * 4)
  return buffer.usage === 'uniform' ? Math.ceil(bytes / 16) * 16 : bytes
}

function initial(buffer) {
  const values = new ARRAYS[buffer.type](buffer.length)
  if (buffer.data) values.set(buffer.data)
  else if (buffer.fill) values.fill(buffer.fill)
  return values
}

function summarize(name, type, values) {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
    sum += value
  }
  const all = values.length <= ENDS * 2
  return {
    name,
    type,
    length: values.length,
    head: Array.from(all ? values : values.subarray(0, ENDS)),
    tail: all ? [] : Array.from(values.subarray(values.length - ENDS)),
    min: values.length ? min : 0,
    max: values.length ? max : 0,
    mean: values.length ? sum / values.length : 0,
  }
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export async function compute(gpu, request, hooks = {}) {
  if (!gpu) return { ok: false, reason: 'no-webgpu', detail: '' }
  const adapter = await gpu.requestAdapter().catch(() => null)
  if (!adapter) return { ok: false, reason: 'no-adapter', detail: '' }
  const described = describeAdapter(adapter)
  const missing = request.features.filter(feature => !adapter.features.has(feature))
  if (missing.length) return { ok: false, reason: 'feature', detail: missing.join(', '), adapter: described }

  const sizes = usage => request.buffers.filter(b => b.usage === usage).map(bufferBytes)
  const needs = {
    maxBufferSize: Math.max(4, ...request.buffers.map(bufferBytes)),
    maxStorageBufferBindingSize: Math.max(4, ...sizes('storage')),
    maxUniformBufferBindingSize: Math.max(4, ...sizes('uniform')),
    maxStorageBuffersPerShaderStage: sizes('storage').length,
    maxUniformBuffersPerShaderStage: sizes('uniform').length,
  }
  for (const [limit, needed] of Object.entries(needs)) {
    if (needed > adapter.limits[limit]) return { ok: false, reason: 'limit', detail: `${limit} ${adapter.limits[limit]} < ${needed}`, adapter: described }
  }
  const timestamps = adapter.features.has('timestamp-query')
  let device
  try {
    device = await adapter.requestDevice({ requiredFeatures: [...request.features, ...timestamps ? ['timestamp-query'] : []], requiredLimits: needs })
  } catch (error) {
    return { ok: false, reason: 'limit', detail: String(error?.message ?? error), adapter: described }
  }
  hooks.device?.(device)
  const lost = device.lost.then(info => info.reason === 'destroyed' ? new Promise(() => {}) : { ok: false, reason: 'device-lost', detail: info.message ?? '', adapter: described })
  try {
    return await Promise.race([lost, dispatch(device, request, described, timestamps)])
  } catch (error) {
    return { ok: false, reason: 'validation', detail: String(error?.message ?? error), adapter: described }
  } finally {
    device.destroy()
  }
}

async function dispatch(device, request, adapter, timestamps) {
  const usage = GPUBufferUsage
  device.pushErrorScope('validation')
  const module = device.createShaderModule({ code: request.code })
  const errors = (await module.getCompilationInfo()).messages.filter(message => message.type === 'error')
  if (errors.length) {
    await device.popErrorScope()
    return { ok: false, reason: 'shader', detail: errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'), adapter }
  }
  const groups = Math.max(0, ...request.buffers.map(b => b.group + 1))
  const layouts = Array.from({ length: groups }, (_, group) => device.createBindGroupLayout({
    entries: request.buffers.filter(b => b.group === group).map(b => ({
      binding: b.binding,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: b.usage === 'uniform' ? 'uniform' : b.access === 'read' ? 'read-only-storage' : 'storage' },
    })),
  }))
  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
    compute: request.entry ? { module, entryPoint: request.entry } : { module },
  })
  const buffers = request.buffers.map((b) => {
    const buffer = device.createBuffer({ size: bufferBytes(b), usage: (b.usage === 'uniform' ? usage.UNIFORM : usage.STORAGE) | usage.COPY_SRC | usage.COPY_DST, mappedAtCreation: true })
    new ARRAYS[b.type](buffer.getMappedRange()).set(initial(b))
    buffer.unmap()
    return buffer
  })
  const bindGroups = layouts.map((layout, group) => device.createBindGroup({
    layout,
    entries: request.buffers.flatMap((b, i) => b.group === group ? [{ binding: b.binding, resource: { buffer: buffers[i] } }] : []),
  }))
  const encode = (encoder, timestampWrites) => {
    const pass = encoder.beginComputePass(timestampWrites ? { timestampWrites } : {})
    pass.setPipeline(pipeline)
    bindGroups.forEach((group, i) => pass.setBindGroup(i, group))
    pass.dispatchWorkgroups(...request.dispatch)
    pass.end()
  }

  const samples = []
  let times
  if (timestamps) {
    const count = request.repeat * 2
    const querySet = device.createQuerySet({ type: 'timestamp', count })
    const resolved = device.createBuffer({ size: count * 8, usage: usage.QUERY_RESOLVE | usage.COPY_SRC })
    times = device.createBuffer({ size: count * 8, usage: usage.MAP_READ | usage.COPY_DST })
    const encoder = device.createCommandEncoder()
    for (let i = 0; i < request.repeat; i++) encode(encoder, { querySet, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 })
    encoder.resolveQuerySet(querySet, 0, count, resolved, 0)
    encoder.copyBufferToBuffer(resolved, 0, times, 0, count * 8)
    device.queue.submit([encoder.finish()])
  } else {
    for (let i = 0; i < request.repeat; i++) {
      const encoder = device.createCommandEncoder()
      encode(encoder)
      const started = performance.now()
      device.queue.submit([encoder.finish()])
      await device.queue.onSubmittedWorkDone()
      samples.push(performance.now() - started)
    }
  }
  const shown = request.buffers.flatMap((b, i) => b.read ? [{ b, copy: device.createBuffer({ size: bufferBytes(b), usage: usage.MAP_READ | usage.COPY_DST }), buffer: buffers[i] }] : [])
  const encoder = device.createCommandEncoder()
  for (const { b, copy, buffer } of shown) encoder.copyBufferToBuffer(buffer, 0, copy, 0, bufferBytes(b))
  device.queue.submit([encoder.finish()])
  const error = await device.popErrorScope()
  if (error) return { ok: false, reason: 'validation', detail: error.message, adapter }

  if (times) {
    await times.mapAsync(GPUMapMode.READ)
    const ns = new BigUint64Array(times.getMappedRange())
    for (let i = 0; i < request.repeat; i++) samples.push(Number(ns[i * 2 + 1] - ns[i * 2]) / 1e6)
  }
  const summaries = []
  for (const { b, copy } of shown) {
    await copy.mapAsync(GPUMapMode.READ)
    summaries.push(summarize(b.name, b.type, new ARRAYS[b.type](copy.getMappedRange(), 0, b.length)))
  }
  return { ok: true, buffers: summaries, timing: { ms: median(samples), samples: samples.length, source: timestamps ? 'gpu' : 'wall' }, adapter }
}
