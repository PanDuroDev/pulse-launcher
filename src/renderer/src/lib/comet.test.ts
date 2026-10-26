import { describe, expect, it } from 'vitest'
import { BotEngine } from '@/components/bloub/bot/engine'
import { STATE_BY_ID } from '@/components/bloub/bot/states'

/**
 * Un etat de montage est rejoue tel quel a chaque tour : sa premiere image doit
 * etre une image de DEPART, pas l'image ou l'animation aboutit.
 */
describe('comet', () => {
  const comet = STATE_BY_ID.get('comet')!

  it('collapses to the dot in the middle of the block', () => {
    const first = comet.pose(0)
    const middle = comet.pose(1.3)
    expect(first.sil.radii[0]).toBeGreaterThan(0.9)
    expect(middle.sil.radii[0]).toBeLessThan(0.2)
  })

  it('holds the ball long enough to be read before it collapses', () => {
    // Le point n'apparait pas avant 0.2 s et la respiration va jusqu'a 0.4 s.
    expect(comet.pose(0.15).sil.radii[0]).toBeGreaterThan(0.95)
    expect(comet.pose(0.9).sil.radii[0]).toBeLessThan(0.4)
  })

  it('has no entry morph', () => {
    // Un morph non nul rejoue l'etat QUITTE pour aller vers la premiere image de
    // la comete : la boule pleine part alors vers le point, et la comete commence
    // par sa fin. Zero, et la boule du point de depart est deja la bonne.
    expect(comet.morph).toBe(0)
  })

  it('renders the same opening frame wherever it is entered from', () => {
    // Arriver de `thinking` place la boule sur le point du milieu : c'est la meme
    // boule, au meme endroit, donc l'ouverture doit etre identique a l'octet.
    const opening = (from: 'idle' | 'thinking') => {
      const engine = new BotEngine()
      engine.setState(from, 0)
      engine.sample(0.4)
      engine.setState('comet', 0.4)
      return engine.sample(0.4 + 1 / 60).bodyPath
    }
    expect(opening('thinking')).toBe(opening('idle'))
  })
})
