import { isCustomElementTag } from './src/domain/index.ts'

// Slidev merges this with its own config and consults our predicate after its
// built-in list of custom elements (P-43). Plain object: `vite` is Slidev's dependency, not ours.
export default {
  slidev: {
    vue: {
      template: {
        compilerOptions: { isCustomElement: isCustomElementTag },
      },
    },
  },
}
