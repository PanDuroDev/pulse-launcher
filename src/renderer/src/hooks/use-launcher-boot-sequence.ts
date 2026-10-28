import { useCallback, useEffect, useState } from 'react'
import { bootPhaseFor } from '@/lib/boot'
import type { BootPhase } from '@/lib/boot'

type LauncherStatus = 'loading' | 'ready' | 'error'

interface LauncherBootSequence {
  bootDone: boolean
  finishBoot: () => void
  revealed: boolean
  bootPhase: BootPhase
}

/** Owns the boot overlay hand-off and the short reveal delay after it finishes. */
export function useLauncherBootSequence(status: LauncherStatus): LauncherBootSequence {
  const [bootDone, setBootDone] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const bootPhase = bootPhaseFor(status)
  const finishBoot = useCallback(() => setBootDone(true), [])

  // The ball lands on the header mark, which is drawn on that same frame; the
  // library then rises in behind it. Two beats, not one, so the eye follows the
  // mark instead of a cross-fade.
  useEffect(() => {
    if (!bootDone) return
    const timer = window.setTimeout(() => setRevealed(true), 180)
    return () => window.clearTimeout(timer)
  }, [bootDone])

  return { bootDone, finishBoot, revealed, bootPhase }
}
