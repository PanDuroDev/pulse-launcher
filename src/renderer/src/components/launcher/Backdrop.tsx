import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { GameSummary } from '@shared/contracts/games'
import { useArtwork } from '@/hooks/use-artwork'

interface BackdropProps {
  game: GameSummary | undefined
  reducedMotion: boolean
}

/**
 * One artwork layer and one scrim. The game accent is deliberately not painted
 * over the chrome: artwork provides the color, the interface stays neutral.
 */
export function Backdrop({ game, reducedMotion }: BackdropProps) {
  const hero = useArtwork(game?.id, 'hero')
  const cover = useArtwork(game?.id, 'cover')
  const image = hero ?? cover
  const systemReduced = useReducedMotion()
  const animate = !reducedMotion && !systemReduced

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-[#050508]">
      <AnimatePresence initial={false}>
        {image ? (
          <motion.img
            key={image}
            src={image}
            alt=""
            initial={animate ? { opacity: 0, scale: 1.04 } : false}
            animate={{ opacity: 0.52, scale: 1.01 }}
            exit={{ opacity: 0 }}
            transition={{ duration: animate ? 0.8 : 0, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-r from-[#050508] via-[#050508]/78 to-[#050508]/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-[#050508]/35 to-[#050508]/60" />

      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%220 0 180 180%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%224%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E")',
        }}
      />
    </div>
  )
}
