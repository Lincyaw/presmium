import { defineCodeblockTransformer, defineTransformersSetup } from '@slidev/types'
import { renderMarkmap } from '../src/node/markmap.ts'

// Slidev hands over each parsed code block, so fences inside lists or other
// blocks are found the same way markdown-it finds them.
const markmap = defineCodeblockTransformer(ctx => /^markmap\b/.test(ctx.info) ? renderMarkmap(ctx.code) : undefined)

export default defineTransformersSetup(() => ({ codeblocks: [markmap] }))
