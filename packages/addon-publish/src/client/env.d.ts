// Stylesheets are imported for their side effects; Vite bundles them in both forms.
declare module '*.css'

// Components are compiled by the host's Vite (Slidev or VitePress).
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
