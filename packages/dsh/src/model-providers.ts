/**
 * The model services an author can set up in Settings → Models, in plain names, and what each one is to DeepSeek
 * Harness: the route its requests take, the settings section that configures the route, the credential reference its
 * key is stored under, and the endpoint and model it starts with. The Kimi, Qwen and GLM routes are pi-ai catalog routes
 * (their model catalogs and request compatibility come with the catalog); Qwen and GLM are pointed at the services'
 * pay-per-use endpoints, which the catalog routes do not use. "Other" is a hand-declared OpenAI-compatible route.
 */
export const MODEL_PROVIDERS = [
  {
    id: 'deepseek',
    route: 'deepseek-official',
    section: 'llm-deepseek',
    key: 'DEEPSEEK_API_KEY',
    protocol: 'anthropic-messages',
    baseURL: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-flash',
    keyPage: 'https://platform.deepseek.com/api_keys',
    pricePage: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
  {
    id: 'qwen',
    route: 'qwen-token-plan-cn',
    section: 'llm-pi-ai',
    key: 'DASHSCOPE_API_KEY',
    protocol: 'openai-completions',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.7-plus',
    keyPage: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    pricePage: 'https://help.aliyun.com/zh/model-studio/model-pricing',
  },
  {
    id: 'kimi',
    route: 'moonshotai-cn',
    section: 'llm-pi-ai',
    key: 'MOONSHOT_API_KEY',
    protocol: 'openai-completions',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2.6',
    keyPage: 'https://platform.moonshot.cn/console/api-keys',
    pricePage: 'https://platform.moonshot.cn/docs/pricing/chat',
  },
  {
    id: 'zhipu',
    route: 'zai-coding-cn',
    section: 'llm-pi-ai',
    key: 'ZHIPUAI_API_KEY',
    protocol: 'openai-completions',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
    keyPage: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    pricePage: 'https://open.bigmodel.cn/pricing',
  },
  {
    id: 'custom',
    route: 'presmium-custom',
    section: 'llm-pi-ai',
    key: 'PRESMIUM_CUSTOM_API_KEY',
    protocol: 'openai-completions',
    baseURL: '',
    model: '',
    keyPage: '',
    pricePage: '',
  },
] as const

export type ModelProviderId = typeof MODEL_PROVIDERS[number]['id']
export type ModelProvider = typeof MODEL_PROVIDERS[number]

export function modelProvider(id: unknown): ModelProvider | undefined {
  return MODEL_PROVIDERS.find(provider => provider.id === id)
}

/** One service as Settings → Models shows it. The key itself never leaves the host. */
export interface ModelProviderState {
  id: ModelProviderId
  /** A key is stored, or the environment Studio was started in supplies one. */
  configured: boolean
  /** The key comes from the environment (so it cannot be changed here). */
  fromEnvironment: boolean
  /** Endpoint and model the route uses now (the defaults until changed under Advanced). */
  baseURL: string
  model: string
  /** New chats use this service. */
  active: boolean
}

export interface ModelSetupAnswer {
  providers: ModelProviderState[]
  writable: boolean
}

/** What Save and Test Connection send: an empty key keeps the stored one. */
export interface ModelSetupRequest {
  id: ModelProviderId
  key?: string
  baseURL?: string
  model?: string
}

/** Why a connection test or a save did not succeed, as codes the page maps to its own text. */
export type ModelSetupFailure = 'no-key' | 'invalid-key' | 'invalid-address' | 'no-model' | 'key-rejected' | 'quota' | 'busy' | 'not-found' | 'rejected' | 'unreachable' | 'read-only' | 'failed'

export type ModelTestAnswer = { ok: true } | { ok: false, failure: ModelSetupFailure, status?: number }

/** The last failed request of an AI chat, for Resend and for reopening the chat after a restart. */
export interface FailedRequest {
  session: string
  turn: number
  text?: string
}

/** How a chat's last AI turn ended, for the activity chip: completed, failed, or stopped before it finished. */
export interface TurnOutcome {
  session: string
  turn: number
  outcome: 'done' | 'failed' | 'cancelled'
}

export const MODEL_SETUP_PATHS = {
  providers: '/api/presmium/assistant/models',
  save: '/api/presmium/assistant/models/save',
  test: '/api/presmium/assistant/models/test',
  failed: '/api/presmium/assistant/failed',
  turn: '/api/presmium/assistant/turn',
} as const
