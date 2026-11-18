/**
 * The Inkstone account snapshot source behind the sidebar launcher: one
 * `GET {baseUrl}/session` read at apply time, published to subscribers when
 * it settles. The source object and the snapshot reference stay stable
 * between changes, as the hook binding contract requires.
 */
import type { InkstoneUser } from '@deepseek-ai/dsh-inkstone-account'

/** The launcher-visible account state. */
export interface InkstoneAccountSnapshot {
  readonly status: 'loading' | 'signed-in' | 'signed-out'
  readonly user?: InkstoneUser
  readonly expiresAtMs?: number
}

/** Bare observable source the renderer binds to the launcher's `useAccount` hook. */
export interface InkstoneAccountSource {
  getSnapshot(): InkstoneAccountSnapshot
  subscribe(listener: () => void): () => void
  /** Publish the signed-out state locally (after a sign-out the endpoint already reflects it). */
  markSignedOut(): void
}

/**
 * Read the session endpoint once and publish the outcome.
 * @param baseUrl - the injected loopback session endpoint.
 * @returns the account source.
 */
export function createInkstoneAccountSource(baseUrl: string): InkstoneAccountSource {
  let snapshot: InkstoneAccountSnapshot = { status: 'loading' }
  const listeners = new Set<() => void>()
  const publish = (value: InkstoneAccountSnapshot): void => {
    snapshot = value
    for (const listener of listeners) listener()
  }
  void (async () => {
    try {
      const response = await fetch(`${baseUrl}/session`, { headers: { accept: 'application/json' } })
      const body = (await response.json()) as { authenticated?: boolean; user?: InkstoneUser; expiresAtMs?: number }
      publish(body.authenticated === true
        ? {
          status: 'signed-in',
          ...(body.user !== undefined ? { user: body.user } : {}),
          ...(body.expiresAtMs !== undefined ? { expiresAtMs: body.expiresAtMs } : {}),
        }
        : { status: 'signed-out' })
    } catch {
      // Without a reachable endpoint the launcher renders the signed-out row.
      publish({ status: 'signed-out' })
    }
  })()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    markSignedOut: () => { publish({ status: 'signed-out' }) },
  }
}
