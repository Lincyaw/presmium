/** JSONB may reorder keys. Canonical bytes and operation identities must survive that round trip. */
export function stableJson(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, item: unknown) => item !== null && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : item, space)
}
