/**
 * The page's own words of the assistant's panels besides ../domain/messages.ts
 * (N-07): what is missing (the server's `missing`, a code with its
 * parameters), in the page's language; the key of the model settings once the
 * service changed; the model in a status bar.
 */
import type { Locale } from '@presmium/kernel'
import type { MissingItem } from '../domain/index.ts'

const zh = {
  missing: {
    model: '模型服务（在“模型设置”中填写，或设置环境变量 DEEPSEEK_API_KEY，或同时设置 PRESMIUM_MODEL_URL、PRESMIUM_MODEL_KEY 与 PRESMIUM_MODEL_PROVIDER 后重启）',
    partial: (names: string[]) => `模型服务：PRESMIUM_MODEL_URL、PRESMIUM_MODEL_KEY 与 PRESMIUM_MODEL_PROVIDER 要一起设置，还缺 ${names.join('、')}`,
    provider: '替换运行时的服务提供方：PRESMIUM_AGENT_COMMAND（或工作区配置中的 command）要配上 PRESMIUM_AGENT_PROVIDER（或 provider）',
    harness: '随包的 DeepSeek Harness（没有安装）',
  },
  keyChanged: '密钥（换了服务或地址，需要重新填写）',
  status: {
    model: (provider: string, source: string) => `模型 ${provider}（${source}）`,
    none: '模型未配置',
    title: '打开模型设置',
  },
  dock: {
    settings: '模型设置',
    close: '收起 AI 修改',
  },
}

type Messages = typeof zh

const en: Messages = {
  missing: {
    model: 'a model service (fill in “Model settings”, or set DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER together, and restart)',
    partial: names => `a model service: PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER go together, and ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} not set`,
    provider: 'the replacement runtime\'s provider: PRESMIUM_AGENT_COMMAND (or the workspace configuration\'s command) needs PRESMIUM_AGENT_PROVIDER (or provider)',
    harness: 'the bundled DeepSeek Harness (not installed)',
  },
  keyChanged: 'Key (the service or address changed: fill it in again)',
  status: {
    model: (provider, source) => `Model ${provider} (${source})`,
    none: 'No model configured',
    title: 'Open the model settings',
  },
  dock: {
    settings: 'Model settings',
    close: 'Hide AI changes',
  },
}

export const CLIENT_MESSAGES: Record<Locale, Messages> = { 'zh-CN': zh, 'en': en }

/**
 * What is missing (`AssistantInfo.missing`), in the page's language, by its
 * code: the model service (with the variables a partial `PRESMIUM_MODEL_*`
 * triple lacks), the provider of a replacement runtime, or the bundled
 * runtime that is not installed.
 */
export function missingText(missing: MissingItem, t: Messages): string {
  switch (missing.code) {
    case 'model': return missing.variables?.length ? t.missing.partial(missing.variables) : t.missing.model
    case 'provider': return t.missing.provider
    case 'harness': return t.missing.harness
  }
}
