import { describe, expect, it } from 'vitest'
import { minDurationOf } from '@/components/bloub/bot/cycles'
import { BOOT_CYCLES, bootPhaseFor } from './boot'

describe('bootPhaseFor', () => {
  it('maps the store lifecycle to the overlay phase', () => {
    expect(bootPhaseFor('loading')).toBe('scan')
    expect(bootPhaseFor('ready')).toBe('ready')
    expect(bootPhaseFor('error')).toBe('error')
  })
})

describe('boot montages', () => {
  it('gives every phase more than one animation', () => {
    for (const blocks of Object.values(BOOT_CYCLES)) {
      expect(blocks.length).toBeGreaterThan(1)
      expect(new Set(blocks.map((block) => block.state)).size).toBe(blocks.length)
    }
  })

  it('never cuts a state before its engine minimum', () => {
    for (const [phase, blocks] of Object.entries(BOOT_CYCLES)) {
      for (const block of blocks) {
        expect(
          block.duration,
          `${phase}: ${block.state} is shorter than its minimum`,
        ).toBeGreaterThanOrEqual(minDurationOf(block.state))
      }
    }
  })

  it('keeps comet in the loading and ready phases', () => {
    expect(BOOT_CYCLES.scan.some((block) => block.state === 'comet')).toBe(true)
    expect(BOOT_CYCLES.ready.some((block) => block.state === 'comet')).toBe(true)
  })
})
