// pickGreeting / greetSlotOf — the blank-home greeting pool picker (KEP-0007).
import { describe, expect, it } from 'vitest'
import { greetSlotOf, pickGreeting } from '../src/client/skeleton/hero-greeting.ts'

const read = (key: string) => ({
  'hero.headline': 'Start your research',
  'hero.greet.any': 'alpha|beta|gamma',
  'hero.greet.morning': 'm1|m2',
  'hero.greet.noon': 'n1',
  'hero.greet.evening': 'e1|e2',
  'hero.greet.night': 'late1',
  'hero.greet.weekend': 'w1',
}[key] ?? '')

const at = (hour: number, day: number) => new Date(2026, 0, day, hour, 0, 0)

describe('greetSlotOf', () => {
  it('buckets hours like the prototype', () => {
    expect(greetSlotOf(at(5, 5))).toBe('morning')
    expect(greetSlotOf(at(10, 5))).toBe('morning')
    expect(greetSlotOf(at(11, 5))).toBe('noon')
    expect(greetSlotOf(at(13, 5))).toBe('noon')
    expect(greetSlotOf(at(14, 5))).toBeUndefined()
    expect(greetSlotOf(at(16, 5))).toBeUndefined()
    expect(greetSlotOf(at(17, 5))).toBe('evening')
    expect(greetSlotOf(at(21, 5))).toBe('evening')
    expect(greetSlotOf(at(22, 5))).toBe('night')
    expect(greetSlotOf(at(2, 5))).toBe('night')
    expect(greetSlotOf(at(4, 5))).toBe('night')
  })
})

describe('pickGreeting', () => {
  it('draws from the any-pool in the daytime lull', () => {
    for (let i = 0; i < 20; i++) {
      const pick = pickGreeting(read, at(15, 5), undefined)
      expect(['alpha', 'beta', 'gamma']).toContain(pick.greeting)
      expect(pick.remember).toBe(pick.greeting)
    }
  })

  it('weights the slot pool double (slot entries ≈ 2/3 of draws at noon)', () => {
    let slotPicks = 0
    const runs = 300
    for (let i = 0; i < runs; i++) {
      if (pickGreeting(read, at(12, 5), undefined).greeting === 'n1') slotPicks++
    }
    // pool = 3 any + 2×1 slot = 5; P(n1) = 2/5. Assert a wide band around it.
    expect(slotPicks / runs).toBeGreaterThan(0.25)
    expect(slotPicks / runs).toBeLessThan(0.55)
  })

  it('adds the weekend pool on Saturdays and Sundays only', () => {
    // 2026-01-03 is a Saturday; 2026-01-07 a Wednesday.
    for (let i = 0; i < 60; i++) {
      expect(['alpha', 'beta', 'gamma', 'w1']).toContain(pickGreeting(read, at(15, 3), undefined).greeting)
      expect(['alpha', 'beta', 'gamma']).toContain(pickGreeting(read, at(15, 7), undefined).greeting)
    }
  })

  it('excludes the previous pick when the pool allows it', () => {
    // Night pool is 'late1' doubled plus 3 any entries; previous 'late1'
    // removes both weighted copies but leaves the any-pool.
    for (let i = 0; i < 20; i++) {
      expect(pickGreeting(read, at(23, 5), 'late1').greeting).not.toBe('late1')
    }
    // Single-entry pool equal to the previous pick: the pick may only repeat.
    const solo = pickGreeting(key => key === 'hero.greet.any' ? 'only' : 'H', at(15, 5), 'only')
    expect(solo.greeting).toBe('only')
  })

  it('falls back to the static headline when every pool is empty', () => {
    const pick = pickGreeting(key => key === 'hero.headline' ? 'Start your research' : '', at(15, 5), undefined)
    expect(pick.greeting).toBe('Start your research')
    expect(pick.remember).toBe('Start your research')
  })
})
