import { isCustomElementTag } from './src/domain/index.ts'

// The viewer app's build: the custom elements the components use are not Vue components.
export default {
  vue: {
    template: {
      compilerOptions: { isCustomElement: isCustomElementTag },
    },
  },
}
