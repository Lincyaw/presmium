export const STAGE_ID = 'presmium.stage'

/** Where a document's drawings are kept: a file of each slide's, named by its section (`encodeURIComponent(id).svg`). */
export const DRAWINGS_DIR = '.presmium/drawings'

/** The plugin's route of the drawings: `drawings` reads them all, `drawings/<section>` writes one (PUT; empty removes it). */
export const DRAWINGS_ROUTE = 'drawings'

/** The shared state of the drawings: each slide's SVG, by section, as the presenter's and the audience's windows have it. */
export const DRAWINGS_KEY = 'presmium.stage.drawings'

export const SCREEN_KEY = 'presmium.stage.screen'
