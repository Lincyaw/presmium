import type { VoiceInfo } from '@lincyaw/kernel'
import { ListSpeakersCommand, SPEECHSAASPRODClient } from '@volcengine/speechsaasprod'
import { BatchListMegaTTSTrainStatusCommand, SPEECHSAASPROD20250521Client } from '@volcengine/speechsaasprod20250521'

// The account side of Volcengine speech, through its official SDK (speech_saas_prod on open.volcengineapi.com):
// the voices the model offers and the account's own cloned voices. It signs with the operator's IAM access key
// pair, which is separate from the speech API key, and only with that pair: the clients get the keys explicitly,
// so the SDK never falls back to its default credential chain (VOLCENGINE_* variables, CLI profiles, instance
// metadata), and a credential reaches no address but Volcengine's own.

export interface ConsoleCredentials { accessKeyId: string, secretAccessKey: string, project: string }

const HOST = 'open.volcengineapi.com'
const REGION = 'cn-beijing'
const PAGE = 100

/** Volcengine's language codes (zh-cn, en, ja …) as BCP 47 tags. */
export function languageTag(code: string): string {
  const [primary = '', region] = code.trim().split(/[-_]/)
  return region ? `${primary.toLowerCase()}-${region.toUpperCase()}` : primary.toLowerCase()
}

/** The states of a trained voice that can be synthesized. */
const USABLE = ['Success', 'Active']

/** The SDK's errors carry Volcengine's own code and message in the response metadata: name them. */
function explained(error: unknown): Error {
  const meta = (error as { data?: { ResponseMetadata?: { Error?: { Code?: string, Message?: string } } } } | undefined)?.data?.ResponseMetadata?.Error
  if (meta?.Code) return new Error(`${meta.Code}: ${meta.Message ?? ''}`.trim())
  return error instanceof Error ? error : new Error(String(error))
}

export function volcengineConsole(credentials: ConsoleCredentials) {
  const config = { host: HOST, region: REGION, protocol: 'https' as const, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, autoRetry: false }
  const voices = new SPEECHSAASPRODClient(config)
  const clones = new SPEECHSAASPROD20250521Client(config)
  return {
    /** Every voice of the model (`resource`), page by page. */
    async speakers(resource: string, signal?: AbortSignal): Promise<VoiceInfo[]> {
      const found: VoiceInfo[] = []
      for (let page = 1; ; page++) {
        const answer = await voices.send(new ListSpeakersCommand({ ResourceIDs: [resource], Page: page, Limit: String(PAGE) }), { abortSignal: signal, timeout: 20_000 }).catch((error: unknown) => { throw explained(error) })
        const speakers = answer.Result?.Speakers ?? []
        for (const speaker of speakers) {
          if (!speaker.VoiceType) continue
          const lang = [...new Set((speaker.Languages ?? []).flatMap(language => (language.Language ? [languageTag(language.Language)] : [])))]
          found.push({ id: speaker.VoiceType, label: speaker.Name || speaker.VoiceType, lang })
        }
        if (speakers.length < PAGE || found.length >= (answer.Result?.Total ?? 0)) return found
      }
    },
    /** The account's cloned voices that can be used now, in the operator's project. */
    async cloned(signal?: AbortSignal): Promise<VoiceInfo[]> {
      const found: VoiceInfo[] = []
      for (const state of USABLE) {
        for (let page = 1; ; page++) {
          const answer = await clones.send(new BatchListMegaTTSTrainStatusCommand({ ProjectName: credentials.project, State: state, PageNumber: page, PageSize: PAGE }), { abortSignal: signal, timeout: 20_000 }).catch((error: unknown) => { throw explained(error) })
          const statuses = answer.Result?.Statuses ?? []
          for (const status of statuses) if (status.SpeakerID) found.push({ id: status.SpeakerID, label: status.Alias || status.SpeakerID, lang: [], cloned: true })
          if (statuses.length < PAGE) break
        }
      }
      return found
    },
  }
}
