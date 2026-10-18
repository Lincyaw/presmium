export const MODEL_VARIABLES = ['PRESMIUM_MODEL_URL', 'PRESMIUM_MODEL_KEY', 'PRESMIUM_MODEL_PROVIDER'] as const

export interface ModelEnv {
  env: Record<string, string>
  from: string[]
  warning?: string
}

const searchUrl = (url: string) => `${url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`

const service = (url: string) => ({ DEEPSEEK_BASE_URL: url, DEEPSEEK_SEARCH_BASE_URL: searchUrl(url) })

export function modelEnv(env: NodeJS.ProcessEnv): ModelEnv {
  const [url, key, provider] = MODEL_VARIABLES.map(name => env[name]?.trim() || undefined)
  if (url && key && provider) return { env: { ...service(url), DEEPSEEK_API_KEY: key }, from: [...MODEL_VARIABLES] }
  const unset = MODEL_VARIABLES.filter((_, i) => ![url, key, provider][i])
  const warning = unset.length < MODEL_VARIABLES.length ? { warning: `${MODEL_VARIABLES.join(', ')} go together; ${unset.join(' and ')} ${unset.length > 1 ? 'are' : 'is'} not set` } : {}
  const deepseek = env.DEEPSEEK_API_KEY?.trim()
  if (deepseek) return { env: { DEEPSEEK_API_KEY: deepseek }, from: ['DEEPSEEK_API_KEY'], ...warning }
  return { env: {}, from: [], ...warning }
}
