// The sprite sheets are imported as modules; a bundler resolves each to the address of the image.
declare module '*.png' {
  const url: string
  export default url
}
