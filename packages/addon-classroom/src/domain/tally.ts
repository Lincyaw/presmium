export function latestPerParticipant<T extends { participant: string, at: number }>(items: Iterable<T>): T[] {
  const latest = new Map<string, T>()
  for (const item of items) {
    const before = latest.get(item.participant)
    if (!before || item.at >= before.at) latest.set(item.participant, item)
  }
  return [...latest.values()]
}
