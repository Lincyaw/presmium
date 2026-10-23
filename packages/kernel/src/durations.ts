/** A duration as authors write one (`{cue}` `pause`, `:durations:`): `1.2` and `1.2s` are seconds, `800ms` milliseconds; in milliseconds. */
export function parseDuration(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/.exec(value.trim())
  if (!match) return undefined
  const n = Number(match[1])
  return Math.round(match[2] === 'ms' ? n : n * 1000)
}
