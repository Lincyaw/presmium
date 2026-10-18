export const SLIDES_PORT = Number(process.env.PRESMIUM_E2E_SLIDES_PORT ?? 4173)
export const WEB_PORT = Number(process.env.PRESMIUM_E2E_WEB_PORT ?? 4174)
export const SLIDES = `http://localhost:${SLIDES_PORT}/slides`
export const WEB = `http://localhost:${WEB_PORT}/web`
