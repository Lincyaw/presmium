declare module 'virtual:presmium-motion/scenes' {
  const scenes: Record<string, () => Promise<{ default?: unknown }>>
  export default scenes
}
