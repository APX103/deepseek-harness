/** The blank-home greeting: one-line locale pools with slot weighting (KEP-0007). */
import type { ConversationKey } from '../locales.ts'

/** A locale copy seat over the conversation dictionaries. */
type Translate = (key: ConversationKey) => string

/** Slot names mirror the prototype's time buckets; `undefined` = daytime lull. */
export type GreetSlot = 'morning' | 'noon' | 'evening' | 'night' | undefined

/**
 * Split a one-line pool (`'|'`-separated dictionary value) into entries; a
 * value without separators is a single-entry pool, i.e. a static headline.
 */
function poolOf(value: string): string[] {
  return value.split('|').map(entry => entry.trim()).filter(entry => entry !== '')
}

/**
 * Map an hour to its greeting slot (prototype `pickGreeting`): morning 5–10,
 * noon 11–13, evening 17–21, night 22–4; the daytime lull has no slot.
 * @param now - the moment to bucket.
 * @returns the slot name, or undefined.
 */
export function greetSlotOf(now: Date): GreetSlot {
  const hour = now.getHours()
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  if (hour >= 17 && hour < 22) return 'evening'
  if (hour >= 22 || hour < 5) return 'night'
  return undefined
}

/** Pick result: the greeting to show and the string the session remembers. */
export interface GreetingPick {
  /** The greeting to render. */
  readonly greeting: string
  /** The value to store as the previous pick (no immediate repeat). */
  readonly remember: string
}

/**
 * Pick the hero greeting from the locale pools: the any-pool plus the
 * current slot's pool weighted double (prototype behavior), the weekend pool
 * on Saturdays and Sundays, excluding the previous pick when possible.
 * @param read - locale copy seat.
 * @param now - the moment of the pick.
 * @param previous - the remembered previous pick, when present.
 * @returns the greeting and the value to remember.
 */
export function pickGreeting(read: Translate, now: Date, previous: string | undefined): GreetingPick {
  const headline = read('hero.headline')
  const pool = poolOf(read('hero.greet.any'))
  const slot = greetSlotOf(now)
  if (slot !== undefined) {
    const entries = poolOf(read(`hero.greet.${slot}` as ConversationKey))
    pool.push(...entries, ...entries)
  }
  if (now.getDay() === 0 || now.getDay() === 6) pool.push(...poolOf(read('hero.greet.weekend')))
  if (pool.length === 0) return { greeting: headline, remember: headline }
  const candidates = pool.filter(entry => entry !== previous)
  const source = candidates.length > 0 ? candidates : pool
  const greeting = source[Math.floor(Math.random() * source.length)] ?? headline
  return { greeting, remember: greeting }
}
