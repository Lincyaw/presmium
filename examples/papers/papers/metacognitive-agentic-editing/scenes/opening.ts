import {defineScene} from '@lincyaw/addon-motion/scene'
import opening from '../../../kit/opening.ts'
export default defineScene(async ctx=>{const inner=await opening.create(ctx);const show=()=>inner.seek(ctx.total);return{seek:show,dispose:()=>inner.dispose?.(),...inner.resize?{resize(w:number,h:number){inner.resize!(w,h);show()}}:{}}})
