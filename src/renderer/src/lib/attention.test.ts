import { describe, expect, it, vi } from 'vitest'
import { REACTION_BY_KIND, announceAttention, subscribeAttention } from './attention'

describe('attention bus', () => {
  it('delivers a kind to every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = subscribeAttention(first)
    const offSecond = subscribeAttention(second)

    announceAttention('hover')

    expect(first).toHaveBeenCalledWith('hover')
    expect(second).toHaveBeenCalledWith('hover')

    offFirst()
    offSecond()
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const off = subscribeAttention(listener)
    off()

    announceAttention('focus')

    expect(listener).not.toHaveBeenCalled()
  })

  it('gives every kind a reaction that fits its shelf life', () => {
    for (const kind of ['hover', 'focus', 'launch'] as const) {
      const reaction = REACTION_BY_KIND[kind]
      expect(reaction.hold).toBeGreaterThan(0)
      expect(reaction.state).not.toBe('')
      expect(reaction.expression).not.toBe('')
    }
    // The launch reaction is the long one: it has particles to finish.
    expect(REACTION_BY_KIND.launch.hold).toBeGreaterThan(REACTION_BY_KIND.hover.hold)
  })
})
