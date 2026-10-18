// The browser part of the operator plugin: once set up, it marks the page (`data-fixture-home`), so the
// test sees on which pages the site loads it. A kernel plugin as a plain object; no package needed.
export const fixtureHome = {
  manifest: { id: 'fixture.home', version: '0.1.0', kernel: '^1.0.0' },
  setup() {
    document.documentElement.dataset.fixtureHome = 'loaded'
  },
}
