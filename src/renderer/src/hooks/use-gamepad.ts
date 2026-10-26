import { useEffect, useRef } from 'react'
import { navigateByDirection } from '@noriginmedia/norigin-spatial-navigation-core'

interface GamepadOptions {
  enabled: boolean
  onConfirm: () => void
  onBack: () => void
  onMenu: () => void
}

const REPEAT_MS = 150
const DEADZONE = 0.55

export function useGamepad({ enabled, onConfirm, onBack, onMenu }: GamepadOptions): void {
  const handlers = useRef({ enabled, onConfirm, onBack, onMenu })

  useEffect(() => {
    handlers.current = { enabled, onConfirm, onBack, onMenu }
  }, [enabled, onBack, onConfirm, onMenu])

  useEffect(() => {
    let frame = 0
    let lastNavigationAt = 0
    let lastConfirm = false
    let lastBack = false
    let lastMenu = false
    let lastDirection: string | null = null
    let lastDirectionAt = 0

    const poll = (time: number): void => {
      const current = handlers.current
      const pads = navigator.getGamepads?.() ?? []
      const pad = Array.from(pads).find((candidate) => candidate?.connected)
      if (pad) {
        const pressed = (index: number): boolean => Boolean(pad.buttons[index]?.pressed)
        const confirm = pressed(0)
        const back = pressed(1)
        const menu = pressed(9)

        if (confirm && !lastConfirm) current.onConfirm()
        if (back && !lastBack) current.onBack()
        if (menu && !lastMenu) current.onMenu()
        lastConfirm = confirm
        lastBack = back
        lastMenu = menu

        if (current.enabled && time - lastNavigationAt > REPEAT_MS) {
          const axisX = pad.axes[0] ?? 0
          const axisY = pad.axes[1] ?? 0
          let direction: string | null = null
          if (pressed(12) || axisY < -DEADZONE) direction = 'up'
          else if (pressed(13) || axisY > DEADZONE) direction = 'down'
          else if (pressed(14) || axisX < -DEADZONE) direction = 'left'
          else if (pressed(15) || axisX > DEADZONE) direction = 'right'

          if (direction) {
            const isNewDirection = direction !== lastDirection
            if (isNewDirection || time - lastDirectionAt > 190) {
              void navigateByDirection(direction)
              lastNavigationAt = time
              lastDirectionAt = time
            }
            lastDirection = direction
          } else {
            lastDirection = null
          }
        }
      }

      frame = requestAnimationFrame(poll)
    }

    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [])
}
