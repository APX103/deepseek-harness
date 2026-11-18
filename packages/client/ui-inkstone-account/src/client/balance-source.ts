/**
 * The 墨点 balance source behind the Models settings footer: reads
 * `GET {baseUrl}/session/balance`, republishing through the same source on
 * every subscription so an opened settings page sees a fresh balance.
 */

/** Bare observable source the renderer binds to the footer's `useBalance` hook. */
export interface InkstoneBalanceSource {
  getSnapshot(): number | undefined
  subscribe(listener: () => void): () => void
}

/**
 * @param baseUrl - the injected loopback session endpoint.
 * @returns the balance source; the snapshot stays `undefined` while the
 * endpoint or the Token Plan service is unavailable.
 */
export function createInkstoneBalanceSource(baseUrl: string): InkstoneBalanceSource {
  let snapshot: number | undefined
  const listeners = new Set<() => void>()
  const publish = (value: number | undefined): void => {
    if (value === snapshot) return
    snapshot = value
    for (const listener of listeners) listener()
  }
  const refresh = (): void => {
    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/session/balance`, { headers: { accept: 'application/json' } })
        if (!response.ok) {
          publish(undefined)
          return
        }
        const body = (await response.json()) as { credits?: unknown }
        publish(typeof body.credits === 'number' && Number.isFinite(body.credits) && body.credits >= 0 ? body.credits : undefined)
      } catch {
        publish(undefined)
      }
    })()
  }
  refresh()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      refresh()
      return () => { listeners.delete(listener) }
    },
  }
}
