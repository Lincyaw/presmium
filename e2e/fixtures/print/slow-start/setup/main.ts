// Slidev starts the app once its setups have run: until then the print page, loaded and idle, shows no slide,
// as a busy machine leaves it while the browser evaluates the page's modules. (No import: the default export is
// the setup function, which `defineAppSetup` would only type.)
export default async function holdBack(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 5000))
}
