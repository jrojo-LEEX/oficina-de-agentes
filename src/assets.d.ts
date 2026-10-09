// Vite inlines these as base64 data URLs, so no file is fetched at run time.
declare module '*.wav?inline' {
  const dataUrl: string
  export default dataUrl
}
