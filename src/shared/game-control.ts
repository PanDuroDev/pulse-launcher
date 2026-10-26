/**
 * How long the launcher waits after a WM_CLOSE request before force quit is
 * offered.
 *
 * The main process enforces this; the renderer only mirrors the wait so the
 * button appears at the same moment the backend would accept it.
 */
export const FORCE_QUIT_GRACE_MS = 5_000
