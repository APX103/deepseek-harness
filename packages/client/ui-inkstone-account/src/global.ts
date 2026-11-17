/**
 * The page global this surface injects and its shape.
 *
 * @module dsh-client-ui-inkstone-account/global
 */

/** Name of the `globalThis` property carrying the session endpoint facts. */
export const INKSTONE_ACCOUNT_GLOBAL = 'INKSTONE_ACCOUNT'

/** Shape injected ahead of the client scripts. */
export interface InkstoneAccountGlobal {
  readonly baseUrl: string
  readonly registerUrl: string
}

/** Read the injected global, when present. */
export function inkstoneAccountGlobal(): InkstoneAccountGlobal | undefined {
  const value = (globalThis as Record<string, unknown>)[INKSTONE_ACCOUNT_GLOBAL]
  if (value === null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (typeof record['baseUrl'] !== 'string' || record['baseUrl'] === '') return undefined
  return {
    baseUrl: record['baseUrl'],
    registerUrl: typeof record['registerUrl'] === 'string' ? record['registerUrl'] : '',
  }
}
