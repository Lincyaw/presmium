/**
 * Text of the WebGPU backend in zh-CN and en (N-07): why a shader cannot run
 * (its recorded output shows instead), what is wrong with its `:params:`, and
 * the summary of a run. The browser follows the UI language
 * (`@presmium/host`); compile time records in English, like the other
 * executors' messages, since a recording goes into every form.
 */
import type { Locale } from '@presmium/kernel'

const zhCN = {
  // Why a shader cannot run here.
  noWebgpu: '浏览器没有 WebGPU',
  noAdapter: '没有可用的 GPU 适配器',
  missingFeature: (features: string) => `GPU 适配器缺少特性 ${features}`,
  missingLimit: (detail: string) => `GPU 适配器的限制不够：${detail}`,
  deviceLost: (detail: string) => `GPU 设备丢失${detail ? `：${detail}` : ''}`,
  timedOut: (ms: number) => `GPU 运行超过 ${ms} ms，已销毁设备并停止`,
  crashed: (error: string) => `GPU 运行出错：${error}`,
  cancelled: '已取消',
  // What is wrong with the shader or its parameters.
  shader: (detail: string) => `着色器有错误：\n${detail}`,
  validation: (detail: string) => `WebGPU 报告错误：${detail}`,
  notYaml: (name: string, error: string) => `:params: 中的 ${name} 不是合法的 YAML：${error}`,
  unknownParam: (name: string) => `:params: 中的 ${name} 不是 buffers、dispatch、entry、repeat、features 之一`,
  noBuffers: ':params: 要写 buffers：着色器中每个缓冲区的数据或大小，例如 {a: [1, 2], out: {size: 2}}',
  bufferShape: (name: string) => `缓冲区 ${name} 要写成数字列表，或 {data, size, fill, type, read}`,
  bufferSize: (name: string) => `缓冲区 ${name} 要有 data 或 size（值的个数）`,
  noDeclaration: (name: string) => `着色器中没有名为 ${name} 的缓冲区（var<storage> 或 var<uniform>）`,
  noBuffer: (name: string) => `着色器的缓冲区 ${name} 没有写在 :params: 的 buffers 中`,
  unsupportedType: (name: string, type: string) => `缓冲区 ${name} 的类型 ${type} 不受支持（f32、i32、u32）`,
  badDispatch: 'dispatch 要写成 1 到 3 个正整数（每个维度的工作组数）',
  badRepeat: (max: number) => `repeat 要是 1 到 ${max} 的整数`,
  badEntry: 'entry 要写成入口函数的名字',
  badFeatures: 'features 要写成特性名的列表，例如 [shader-f16]',
  tooLarge: (bytes: number, max: number) => `缓冲区共 ${bytes} 字节，超过规模限制 ${max} 字节`,
  // The summary of a run.
  stats: (min: string, max: string, mean: string) => `最小 ${min}，最大 ${max}，平均 ${mean}`,
  time: (ms: string, samples: number, gpu: boolean, emulated: boolean) =>
    `计时：每次派发 ${ms} ms（${[samples > 1 ? `${samples} 次的中位数` : '', gpu ? 'GPU 时间戳' : '挂钟时间', emulated ? 'CPU 模拟' : ''].filter(Boolean).join('；')}）`,
  adapter: (name: string, fallback: boolean) => `适配器：${name}${fallback ? '（回退适配器）' : ''}`,
}

export type WebgpuMessages = typeof zhCN

const en: WebgpuMessages = {
  noWebgpu: 'This browser has no WebGPU',
  noAdapter: 'No GPU adapter is available',
  missingFeature: features => `The GPU adapter lacks the feature ${features}`,
  missingLimit: detail => `The GPU adapter's limits are too low: ${detail}`,
  deviceLost: detail => `The GPU device was lost${detail ? `: ${detail}` : ''}`,
  timedOut: ms => `The GPU ran over ${ms} ms; the device was destroyed and the run stopped`,
  crashed: error => `The GPU run failed: ${error}`,
  cancelled: 'Cancelled',
  shader: detail => `The shader has errors:\n${detail}`,
  validation: detail => `WebGPU reported an error: ${detail}`,
  notYaml: (name, error) => `${name} in :params: is not valid YAML: ${error}`,
  unknownParam: name => `${name} in :params: is not one of buffers, dispatch, entry, repeat, features`,
  noBuffers: ':params: needs buffers: the data or size of each buffer of the shader, e.g. {a: [1, 2], out: {size: 2}}',
  bufferShape: name => `The buffer ${name} is a list of numbers, or {data, size, fill, type, read}`,
  bufferSize: name => `The buffer ${name} needs data or size (its number of values)`,
  noDeclaration: name => `The shader has no buffer named ${name} (var<storage> or var<uniform>)`,
  noBuffer: name => `The shader's buffer ${name} is not in the buffers of :params:`,
  unsupportedType: (name, type) => `The type ${type} of the buffer ${name} is not supported (f32, i32, u32)`,
  badDispatch: 'dispatch is 1 to 3 positive integers (workgroups in each dimension)',
  badRepeat: max => `repeat is an integer from 1 to ${max}`,
  badEntry: 'entry is the name of the entry point',
  badFeatures: 'features is a list of feature names, e.g. [shader-f16]',
  tooLarge: (bytes, max) => `The buffers take ${bytes} bytes, over the scale limit of ${max} bytes`,
  stats: (min, max, mean) => `min ${min}, max ${max}, mean ${mean}`,
  time: (ms, samples, gpu, emulated) =>
    `time: ${ms} ms per dispatch (${[samples > 1 ? `median of ${samples}` : '', gpu ? 'GPU timestamps' : 'wall clock', emulated ? 'CPU emulation' : ''].filter(Boolean).join('; ')})`,
  adapter: (name, fallback) => `adapter: ${name}${fallback ? ' (fallback adapter)' : ''}`,
}

export const MESSAGES: Record<Locale, WebgpuMessages> = { 'zh-CN': zhCN, en }
