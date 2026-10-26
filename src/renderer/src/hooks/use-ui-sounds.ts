import { useLayoutEffect } from 'react'
import { applyUISoundEnabled, playUI, unlockUISounds } from '@/lib/ui-sfx'

/** Controls that get hover/press cues. Text fields and links are excluded. */
const INTERACTIVE_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="radio"]',
  '[role="tab"]',
].join(', ')

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

function interactiveFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR)
  if (!element) return null
  if (element.closest('[data-sfx="off"]')) return null
  if (element.getAttribute('aria-disabled') === 'true') return null
  if (element.matches(':disabled')) return null
  return element
}

/**
 * Global, delegated UI feedback: one listener set covers every button, card,
 * switch and menu item, including the ones rendered after this runs. Keyboard
 * navigation is reported here too, because spatial navigation moves a virtual
 * focus and never fires DOM focus events.
 *
 * A layout effect flips the mute flag during the commit itself, so no pointer
 * event can slip through after the switch is turned off but before this hook
 * has seen the new value.
 */
export function useUISounds(enabled: boolean): void {
  useLayoutEffect(() => {
    applyUISoundEnabled(enabled)
    if (!enabled) return

    let pressed: HTMLElement | null = null

    const unlock = (): void => unlockUISounds()

    const onPointerOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return
      const element = interactiveFrom(event.target)
      if (!element) return
      // `pointerover` also fires for children of the element; only announce
      // the moment the pointer truly enters the control.
      const related = event.relatedTarget
      if (related instanceof Node && element.contains(related)) return
      playUI('hover')
    }

    const onPointerDown = (event: PointerEvent): void => {
      const element = interactiveFrom(event.target)
      if (!element) return
      pressed = element
      playUI('press')
    }

    const onPointerUp = (): void => {
      if (!pressed) return
      pressed = null
      playUI('release')
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      unlock()
      if (isTyping(event.target)) return
      if (event.key === 'Enter' || event.key === ' ') {
        playUI('press')
        return
      }
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
        playUI('focus')
      }
    }

    window.addEventListener('pointerdown', unlock, { capture: true, passive: true })
    window.addEventListener('keydown', unlock, { capture: true, passive: true })
    document.addEventListener('pointerover', onPointerOver, { passive: true })
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('pointerup', onPointerUp, { passive: true })
    document.addEventListener('pointercancel', onPointerUp, { passive: true })
    window.addEventListener('keydown', onKeyDown, true)

    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [enabled])
}
