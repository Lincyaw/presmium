import { isCustomElementTag } from './src/domain/index.ts'

export default {
  slidev: {
    vue: {
      template: {
        compilerOptions: { isCustomElement: isCustomElementTag },
      },
    },
  },
}
