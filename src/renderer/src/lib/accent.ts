export const DEFAULT_ACCENT = '258 88% 66%'

/**
 * Single, desaturated accent for launcher chrome. Artwork stays the source of
 * changing color; controls use this one value so the interface does not
 * re-tint every time the selection changes.
 */
export function uiAccent(alpha = 1): string {
  return alpha >= 1
    ? 'hsl(var(--pulse-accent))'
    : `hsl(var(--pulse-accent) / ${alpha})`
}

export function accentAlpha(accent: string | undefined, alpha: number): string {
  return `hsl(${accent ?? DEFAULT_ACCENT} / ${alpha})`
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
