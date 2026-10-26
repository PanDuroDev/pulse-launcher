import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ArtKind } from '@shared/types'

const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

let revision = 0

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getRevision(): number {
  return revision
}

/**
 * Drops every cached URL for one game and wakes the mounted artwork hooks, so
 * a newly picked cover replaces the old one without remounting the library.
 * Main already gives a changed image a new hashed file name.
 */
export function invalidateArtwork(gameId: string): void {
  for (const kind of ['cover', 'hero', 'icon', 'logo'] as ArtKind[]) {
    const key = `${gameId}:${kind}`
    cache.delete(key)
    pending.delete(key)
  }
  revision += 1
  for (const listener of listeners) listener()
}

function loadArtwork(gameId: string, kind: ArtKind): Promise<string | null> {
  const key = `${gameId}:${kind}`
  const existing = pending.get(key)
  if (existing) return existing

  const promise = window.launcher.catalog
    .artwork(gameId, kind)
    .then((result) => result.url)
    .catch(() => null)
    .then((url) => {
      cache.set(key, url)
      pending.delete(key)
      return url
    })
  pending.set(key, promise)
  return promise
}

export function useArtwork(
  gameId: string | null | undefined,
  kind: ArtKind,
  enabled = true,
): string | null {
  const key = gameId ? `${gameId}:${kind}` : ''
  const version = useSyncExternalStore(subscribe, getRevision, getRevision)
  // The cached value is the source of truth during render; this counter only
  // repaints after a fetch resolves.
  const [, setLoaded] = useState(0)

  const url = key ? (cache.get(key) ?? null) : null

  useEffect(() => {
    if (!gameId || !enabled) return
    if (cache.has(key)) return
    let cancelled = false
    void loadArtwork(gameId, kind).then(() => {
      if (!cancelled) setLoaded((count) => count + 1)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, gameId, key, kind, version])

  return url
}
