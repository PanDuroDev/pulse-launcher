import { describe, expect, it } from 'vitest'
import { REST_GAZE } from '@/components/bloub/bot/face'
import { brandLook, lookTarget, SPIN, TURN, YAW_MAX } from '@/components/bloub/gaze'

describe('brandLook', () => {
  it('poses the mark on the catalogue resting face, to the right', () => {
    const look = brandLook({ nx: 0, ny: 0, tour: 1, pointer: false })
    expect(look.yaw).toBe(REST_GAZE.yaw)
    expect(look.yaw).toBeGreaterThan(0)
    expect(look.pitch).toBe(REST_GAZE.pitch)
    expect(look.mix).toBe(1)
    expect(look.spin).toBe(0)
  })

  it('moves the look around that pose with the pointer', () => {
    expect(brandLook({ nx: 1, ny: 0, tour: 1, pointer: true }).yaw).toBe(
      REST_GAZE.yaw + YAW_MAX,
    )
    expect(brandLook({ nx: -1, ny: 0, tour: 1, pointer: true }).yaw).toBe(
      REST_GAZE.yaw - YAW_MAX,
    )
    expect(brandLook({ nx: 0, ny: 1, tour: 1, pointer: true }).pitch).toBe(
      REST_GAZE.pitch - 13,
    )
    expect(brandLook({ nx: 0, ny: 0, tour: 1, pointer: true }).wander).toBe(0)
  })

  it('keeps the drift when no pointer is known', () => {
    expect(brandLook({ nx: 0, ny: 0, tour: 1, pointer: false }).wander).toBe(1)
  })

  it('starts the arrival with a full spin that lands exactly', () => {
    const look = brandLook({ nx: 0, ny: 0, tour: 0, pointer: false })
    expect(look.mix).toBe(0)
    expect(look.spin).toBe(SPIN)
  })

  it('leaves the upstream settings-panel pose alone', () => {
    expect(lookTarget({ nx: 0, ny: 0, tour: 1, pointer: false }).yaw).toBe(-TURN)
  })
})
