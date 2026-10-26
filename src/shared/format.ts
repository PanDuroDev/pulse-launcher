const SOURCE_LABELS: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  manual: 'Local',
  'start-menu': 'Desktop',
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? 'Game'
}

export function formatBytes(bytes: number | undefined): string | null {
  if (!bytes || bytes <= 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatLastPlayed(timestamp: number | undefined): string | null {
  if (!timestamp) return null
  const delta = Date.now() - timestamp
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function accentFor(value: string): string {
  const hue = hashString(value) % 360
  return `${hue} 78% 58%`
}
