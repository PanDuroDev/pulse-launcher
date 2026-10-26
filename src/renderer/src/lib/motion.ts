/**
 * True when interface motion should be reduced, from either the app setting
 * (rendered as data-motion on the app root) or the Windows preference.
 */
export function prefersReducedMotion(): boolean {
  if (document.querySelector('[data-motion="reduced"]')) return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
