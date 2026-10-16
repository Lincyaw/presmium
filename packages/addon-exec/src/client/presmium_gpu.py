"""
WebGPU from Python in the browser (P-104). The Pyodide worker of the execution plugin makes this
module importable: it runs a WGSL compute shader with `navigator.gpu`, through Pyodide's bridge
to JavaScript, as the WebGPU plugin runs `{run-panel} wgsl`: buffers by the names of the shader's
variables (a list of numbers, or a dict with `data`, `size`, `fill`, `type`, `read`), `dispatch`,
`entry`, `repeat` and `features`.

    import presmium_gpu as gpu
    result = await gpu.run(SHADER, buffers={'a': [1, 2], 'b': [3, 4], 'out': {'size': 2}})
    result['out']    # [4.0, 6.0], the buffers read back (those the shader may write)
    print(result)    # each buffer, the median time of a dispatch and the adapter

`await` works at the top of a code block. Where the browser has JavaScript Promise Integration
(JSPI), `gpu.run_sync(...)` does the same without `await` (`gpu.can_run_sync()` says whether it
can). A shader that cannot run here (no WebGPU, no adapter, a missing feature or limit, a lost
device) raises `GPUUnavailable`; one WebGPU rejects, `GPUError`.
"""
import re

import js
import pyodide.ffi
from pyodide.ffi import JsException, can_run_sync, create_once_callable, to_js
from pyodide.ffi import run_sync as _run_sync

__all__ = ['GPUError', 'GPUUnavailable', 'Result', 'can_run_sync', 'run', 'run_sync']

_ARRAYS = {'f32': 'Float32Array', 'i32': 'Int32Array', 'u32': 'Uint32Array'}
# Values shown at each end of a long buffer.
_ENDS = 4
_DECLARATION = re.compile(r'((?:@\s*\w+\s*(?:\([^)]*\))?\s*)+)var\s*<\s*(storage|uniform)\s*(?:,\s*(read_write|read))?\s*>\s*([A-Za-z_]\w*)\s*:\s*([^;]+);')
_SHORTHAND = {'f': 'f32', 'i': 'i32', 'u': 'u32', 'h': 'f16'}


class GPUUnavailable(RuntimeError):
    """The shader cannot run in this browser: no WebGPU, no adapter, a missing feature or limit, a lost device."""


class GPUError(RuntimeError):
    """WebGPU rejected the shader or the buffers."""


def _js(value):
    return to_js(value, dict_converter=js.Object.fromEntries)


def _absent(value):
    """JavaScript's `null` or `undefined` (Pyodide gives `null` as `jsnull`)."""
    return value is None or value is getattr(pyodide.ffi, 'jsnull', None)


def _declarations(code):
    """The buffers the shader declares: name, group, binding, address space, access, scalar type."""
    source = re.sub(r'//.*$', '', re.sub(r'/\*[\s\S]*?\*/', '', code), flags=re.M)
    found = []
    for attributes, space, access, name, kind in _DECLARATION.findall(source):
        def attribute(key):
            match = re.search(r'@\s*%s\s*\(\s*(\d+)\s*\)' % key, attributes)
            return int(match.group(1)) if match else 0
        scalars = set(re.findall(r'\b(f32|i32|u32|f16)\b', kind)) | {_SHORTHAND[s] for s in re.findall(r'\b(?:vec[234]|mat[234]x[234])([fiuh])\b', kind)}
        found.append({
            'name': name,
            'group': attribute('group'),
            'binding': attribute('binding'),
            'usage': space,
            'access': 'read_write' if space == 'storage' and access == 'read_write' else 'read',
            'scalar': next(iter(scalars)) if len(scalars) == 1 else None,
        })
    return found


def _buffers(code, specs):
    declared = _declarations(code)
    for name in specs:
        if not any(d['name'] == name for d in declared):
            raise ValueError('The shader has no buffer named %s (var<storage> or var<uniform>)' % name)
    buffers = []
    for d in declared:
        if d['name'] not in specs:
            raise ValueError("The shader's buffer %s is not in buffers" % d['name'])
        spec = specs[d['name']]
        fields = {'data': list(spec)} if isinstance(spec, (list, tuple, range)) else dict(spec)
        data = fields.get('data')
        kind = fields.get('type') or d['scalar'] or 'f32'
        if kind not in _ARRAYS:
            raise ValueError('The type %s of the buffer %s is not supported (f32, i32, u32)' % (kind, d['name']))
        length = max(fields.get('size') or 0, len(data) if data is not None else 0)
        if length == 0:
            raise ValueError('The buffer %s needs data or size (its number of values)' % d['name'])
        read = fields.get('read')
        buffers.append(dict(d, type=kind, length=length, data=data, fill=fields.get('fill'), read=d['access'] == 'read_write' if read is None else read))
    return buffers


def _bytes(buffer):
    size = max(4, buffer['length'] * 4)
    return -(-size // 16) * 16 if buffer['usage'] == 'uniform' else size


def _number(value):
    """A value as the summary shows it: integers whole, others to 6 significant digits."""
    if value == value and abs(value) != float('inf') and value == int(value) and abs(value) < 1e15:
        return str(int(value))
    return '%.6g' % value


class Result(dict):
    """The buffers read back, by name (lists of numbers), with `timing` and `adapter`."""

    def __init__(self, values, types, timing, adapter):
        super().__init__(values)
        self.types = types
        self.timing = timing
        self.adapter = adapter

    def __str__(self):
        lines = []
        for name, values in self.items():
            shown = values if len(values) <= _ENDS * 2 else values[:_ENDS] + ['…'] + values[-_ENDS:]
            line = '%s: %s[%d] = [%s]' % (name, self.types[name], len(values), ', '.join(v if v == '…' else _number(v) for v in shown))
            if len(values) > _ENDS * 2:
                line += '  min %s, max %s, mean %s' % (_number(min(values)), _number(max(values)), _number(sum(values) / len(values)))
            lines.append(line)
        timing, adapter = self.timing, self.adapter
        notes = [n for n in ['median of %d' % timing['samples'] if timing['samples'] > 1 else '', 'GPU timestamps' if timing['source'] == 'gpu' else 'wall clock', 'CPU emulation' if adapter['fallback'] else ''] if n]
        lines.append('time: %s ms per dispatch (%s)' % (_number(float('%.3g' % timing['ms'])), '; '.join(notes)))
        name = ' '.join(p for p in [adapter['vendor'], adapter['architecture']] if p) or adapter['description'] or 'unknown'
        lines.append('adapter: %s%s' % (name, ' (fallback adapter)' if adapter['fallback'] else ''))
        return '\n'.join(lines)


def _adapter(adapter):
    info = getattr(adapter, 'info', None)

    def field(key, default=''):
        return default if _absent(info) else getattr(info, key, default)

    fallback = bool(field('isFallbackAdapter', False) or getattr(adapter, 'isFallbackAdapter', False)) or field('architecture') == 'swiftshader'
    return {'vendor': field('vendor'), 'architecture': field('architecture'), 'description': field('description'), 'fallback': fallback}


async def run(shader, buffers, dispatch=1, entry=None, repeat=1, features=()):
    """Runs the compute shader `repeat` times on the buffers; returns the `Result`."""
    gpu = getattr(js.navigator, 'gpu', None)
    if _absent(gpu):
        raise GPUUnavailable('This browser has no WebGPU')
    adapter = await gpu.requestAdapter()
    if _absent(adapter):
        raise GPUUnavailable('No GPU adapter is available')
    described = _adapter(adapter)
    missing = [f for f in features if not adapter.features.has(f)]
    if missing:
        raise GPUUnavailable('The GPU adapter lacks the feature %s' % ', '.join(missing))
    specs = _buffers(shader, buffers)
    groups = list(dispatch) if isinstance(dispatch, (list, tuple)) else [dispatch]
    groups += [1] * (3 - len(groups))
    storage = [_bytes(b) for b in specs if b['usage'] == 'storage']
    uniform = [_bytes(b) for b in specs if b['usage'] == 'uniform']
    needs = {
        'maxBufferSize': max([4] + [_bytes(b) for b in specs]),
        'maxStorageBufferBindingSize': max([4] + storage),
        'maxUniformBufferBindingSize': max([4] + uniform),
        'maxStorageBuffersPerShaderStage': len(storage),
        'maxUniformBuffersPerShaderStage': len(uniform),
    }
    for limit, needed in needs.items():
        if needed > getattr(adapter.limits, limit):
            raise GPUUnavailable("The GPU adapter's limits are too low: %s %d < %d" % (limit, getattr(adapter.limits, limit), needed))
    timestamps = adapter.features.has('timestamp-query')
    device = await adapter.requestDevice(_js({'requiredFeatures': list(features) + (['timestamp-query'] if timestamps else []), 'requiredLimits': needs}))
    lost = []
    device.lost.then(create_once_callable(lambda info: lost.append(info.message) if info.reason != 'destroyed' else None))
    try:
        return await _dispatch(device, shader, specs, groups, entry, repeat, timestamps, described)
    except JsException as error:
        if lost:
            raise GPUUnavailable('The GPU device was lost: %s' % lost[0]) from None
        raise GPUError(str(error)) from None
    finally:
        device.destroy()


async def _dispatch(device, shader, specs, groups, entry, repeat, timestamps, adapter):
    usage = js.GPUBufferUsage
    device.pushErrorScope('validation')
    module = device.createShaderModule(_js({'code': shader}))
    errors = [m for m in (await module.getCompilationInfo()).messages if m.type == 'error']
    if errors:
        await device.popErrorScope()
        raise GPUError('The shader has errors:\n' + '\n'.join('%d:%d %s' % (m.lineNum, m.linePos, m.message) for m in errors))
    count = max([b['group'] + 1 for b in specs] + [0])
    layouts = [device.createBindGroupLayout(_js({'entries': [
        {'binding': b['binding'], 'visibility': js.GPUShaderStage.COMPUTE, 'buffer': {'type': 'uniform' if b['usage'] == 'uniform' else 'read-only-storage' if b['access'] == 'read' else 'storage'}}
        for b in specs if b['group'] == group
    ]})) for group in range(count)]
    stage = {'module': module, 'entryPoint': entry} if entry else {'module': module}
    pipeline = device.createComputePipeline(_js({'layout': device.createPipelineLayout(_js({'bindGroupLayouts': layouts})), 'compute': stage}))
    gpu_buffers = []
    for b in specs:
        buffer = device.createBuffer(_js({'size': _bytes(b), 'usage': (usage.UNIFORM if b['usage'] == 'uniform' else usage.STORAGE) | usage.COPY_SRC | usage.COPY_DST, 'mappedAtCreation': True}))
        values = getattr(js, _ARRAYS[b['type']]).new(buffer.getMappedRange())
        if b['data'] is not None:
            values.set(_js(list(b['data'])))
        elif b['fill']:
            values.fill(b['fill'])
        buffer.unmap()
        gpu_buffers.append(buffer)
    bind_groups = [device.createBindGroup(_js({'layout': layout, 'entries': [
        {'binding': b['binding'], 'resource': {'buffer': gpu_buffers[i]}} for i, b in enumerate(specs) if b['group'] == group
    ]})) for group, layout in enumerate(layouts)]

    def encode(encoder, writes=None):
        compute_pass = encoder.beginComputePass(_js({'timestampWrites': writes} if writes else {}))
        compute_pass.setPipeline(pipeline)
        for i, group in enumerate(bind_groups):
            compute_pass.setBindGroup(i, group)
        compute_pass.dispatchWorkgroups(*groups)
        compute_pass.end()

    samples = []
    times = None
    if timestamps:
        queries = repeat * 2
        query_set = device.createQuerySet(_js({'type': 'timestamp', 'count': queries}))
        resolved = device.createBuffer(_js({'size': queries * 8, 'usage': usage.QUERY_RESOLVE | usage.COPY_SRC}))
        times = device.createBuffer(_js({'size': queries * 8, 'usage': usage.MAP_READ | usage.COPY_DST}))
        encoder = device.createCommandEncoder()
        for i in range(repeat):
            encode(encoder, {'querySet': query_set, 'beginningOfPassWriteIndex': i * 2, 'endOfPassWriteIndex': i * 2 + 1})
        encoder.resolveQuerySet(query_set, 0, queries, resolved, 0)
        encoder.copyBufferToBuffer(resolved, 0, times, 0, queries * 8)
        device.queue.submit(_js([encoder.finish()]))
    else:
        for _ in range(repeat):
            encoder = device.createCommandEncoder()
            encode(encoder)
            started = js.performance.now()
            device.queue.submit(_js([encoder.finish()]))
            await device.queue.onSubmittedWorkDone()
            samples.append(js.performance.now() - started)
    shown = [(b, device.createBuffer(_js({'size': _bytes(b), 'usage': usage.MAP_READ | usage.COPY_DST})), gpu_buffers[i]) for i, b in enumerate(specs) if b['read']]
    encoder = device.createCommandEncoder()
    for b, copy, buffer in shown:
        encoder.copyBufferToBuffer(buffer, 0, copy, 0, _bytes(b))
    device.queue.submit(_js([encoder.finish()]))
    error = await device.popErrorScope()
    if not _absent(error):
        raise GPUError('WebGPU reported an error: %s' % error.message)

    if times is not None:
        await times.mapAsync(js.GPUMapMode.READ)
        ns = js.BigUint64Array.new(times.getMappedRange()).to_py().tolist()
        samples = [(ns[i * 2 + 1] - ns[i * 2]) / 1e6 for i in range(repeat)]
    values = {}
    for b, copy, _buffer in shown:
        await copy.mapAsync(js.GPUMapMode.READ)
        values[b['name']] = getattr(js, _ARRAYS[b['type']]).new(copy.getMappedRange(), 0, b['length']).to_py().tolist()
    ordered = sorted(samples)
    middle = len(ordered) // 2
    ms = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    timing = {'ms': ms, 'samples': len(samples), 'source': 'gpu' if timestamps else 'wall'}
    return Result(values, {b['name']: b['type'] for b, _copy, _buffer in shown}, timing, adapter)


def run_sync(shader, buffers, **options):
    """`run` without `await`, where the browser has JavaScript Promise Integration (JSPI)."""
    if not can_run_sync():
        raise RuntimeError('run_sync needs JavaScript Promise Integration (JSPI), which this browser lacks; use `await presmium_gpu.run(...)`')
    return _run_sync(run(shader, buffers, **options))
