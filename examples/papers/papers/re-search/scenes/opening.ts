import { defineScene } from '@lincyaw/addon-motion/scene'
import opening from '../../../kit/opening.ts'

// The opening is a still cover; narration plays over the complete frame.
export default defineScene(async ctx => {
  const cover = await opening.create(ctx)
  const show = () => cover.seek(ctx.total)
  return {
    seek: show,
    dispose: () => cover.dispose?.(),
    ...cover.resize ? { resize(width: number, height: number) { cover.resize!(width, height); show() } } : {},
  }
})
