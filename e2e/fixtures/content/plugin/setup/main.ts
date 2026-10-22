// The slides form runs a package's Slidev setup: it defines the element when the app starts.
import { defineCounter } from '../counter.ts'

export default () => {
  defineCounter()
}
