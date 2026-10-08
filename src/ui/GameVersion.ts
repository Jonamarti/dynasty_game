/** Build identity injected once by Vite from package.json and the checked-out commit. */
export const GAME_VERSION_LABEL = 'v' + __APP_VERSION__ + ' (' + __APP_COMMIT__ + ')';
