/**
 * The 墨点 balance source behind the Models settings footer and the account
 * launcher: reads `GET {baseUrl}/session/balance`, republishing through the
 * same source on every subscription so an opened settings page sees a fresh
 * balance.
 */

/** One usage window fact as the loopback endpoint serves it. */
export interface InkstoneUsageWindow {
  readonly id: string
  readonly limitCredits: number
  readonly usedCredits: number
  readonly remainingCredits: number
  readonly nextRecoverAt?: string
}

/** The balance snapshot: total credits, the spendable floor, and the windows that cap it. */
export interface InkstoneBalanceSnapshot {
  readonly credits: number
  readonly effectiveCredits: number
  readonly windows: readonly InkstoneUsageWindow[]
}

/** Bare observable source the renderer binds to the `useBalance` hook. */
export interface InkstoneBalanceSource {
  getSnapshot(): InkstoneBalanceSnapshot | undefined
  subscribe(listener: () => void): () => void
  /** Fetch the balance again now; subscriptions alone refresh only at bind time. */
  refresh(): void
}

/**
 * @param baseUrl - the injected loopback session endpoint.
 * @returns the balance source; the snapshot stays `undefined` while the
 * endpoint or the Token Plan service is unavailable.
 */
export function createInkstoneBalanceSource(baseUrl: string): InkstoneBalanceSource {  let snapshot: InkstoneBalanceSnapshot | undefined
  const listeners = new Set<() => void>()
  const publish = (value: InkstoneBalanceSnapshot | undefined): void => {
    if (value?.credits === snapshot?.credits && value?.effectiveCredits === snapshot?.effectiveCredits
      && JSON.stringify(value?.windows ?? []) === JSON.stringify(snapshot?.windows ?? [])) return
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
        const body = (await response.json()) as {
          credits?: unknown
          effectiveCredits?: unknown
          windows?: unknown
        }
        const credits = typeof body.credits === 'number' && Number.isFinite(body.credits) && body.credits >= 0 ? body.credits : undefined
        if (credits === undefined) {
          publish(undefined)
          return
        }
        const windows = Array.isArray(body.windows)
          ? (body.windows as InkstoneUsageWindow[]).filter(window =>
            typeof window?.id === 'string' && Number.isFinite(window?.remainingCredits))
          : []
        const effective = typeof body.effectiveCredits === 'number' && Number.isFinite(body.effectiveCredits)
          ? body.effectiveCredits
          : windows.reduce((floor, window) => Math.min(floor, window.remainingCredits), credits)
        publish({ credits, effectiveCredits: Math.min(effective, credits), windows })
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
    refresh,
  }
}

/** The window that currently caps spending: the tightest one, only when it binds below the total. */
export function bindingWindow(snapshot: InkstoneBalanceSnapshot | undefined): InkstoneUsageWindow | undefined {
  if (snapshot === undefined || snapshot.effectiveCredits >= snapshot.credits) return undefined
  return snapshot.windows.reduce<InkstoneUsageWindow | undefined>((tightest, window) =>
    tightest === undefined || window.remainingCredits < tightest.remainingCredits ? window : tightest, undefined)
}
