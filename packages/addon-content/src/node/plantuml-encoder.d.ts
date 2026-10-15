// plantuml-encoder ships no types; this is the part the content plugin uses.
declare module 'plantuml-encoder' {
  const encoder: { encode(text: string): string }
  export default encoder
}
