/**
 * User-center API client, ported from intern-inkstone
 * `src/main/features/auth/api-client.ts`: code exchange, profile, logout.
 * Pure TS with an injectable fetch — no Electron dependencies.
 *
 * @module dsh-inkstone-account/api-client
 */
import type { Config } from './config.ts'
import { InkstoneAccountError } from './errors.ts'
import { readJwtFromAuthResponse, sanitizeAuthUser } from './protocol.ts'
import type { InkstoneUser } from './protocol.ts'

export type AuthFetch = (input: string, init: RequestInit) => Promise<Response>

/** One user-center call boundary; injectable for tests. */
export interface AuthApiClientDeps {
  readonly config: Config
  readonly fetch: AuthFetch
  readonly now?: () => number
}

/** Client for the unit user-center (`/users/*`) surface. */
export class AuthApiClient {
  readonly #deps: AuthApiClientDeps

  constructor(deps: AuthApiClientDeps) {
    this.#deps = deps
  }

  /** Exchange one `uaa::code::` SSO code for the bearer JWT. */
  async exchangeCode(code: string): Promise<string> {
    return readJwtFromAuthResponse(await this.#post('/users/auth', { code }), this.#deps.now?.() ?? Date.now())
  }

  /** Read the sanitized account profile behind one JWT. */
  async getUserInfo(token: string): Promise<InkstoneUser> {
    return sanitizeAuthUser(await this.#post('/users/getUserInfo', { jwt: token }, token))
  }

  /** Revoke one JWT server-side; failures propagate to the caller. */
  async logout(token: string): Promise<void> {
    await this.#post('/users/logout', { jwt: token }, token)
  }

  async #post(path: string, body: Readonly<Record<string, string>>, authorizationToken?: string): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(authorizationToken !== undefined ? { authorization: `Bearer ${authorizationToken}` } : {}),
    }
    let response: Response
    try {
      response = await this.#deps.fetch(`${this.#deps.config.authBaseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.#deps.config.requestTimeoutMs),
      })
    } catch (cause) {
      throw new InkstoneAccountError('AUTH_NETWORK', 'The authentication service could not be reached.', { cause })
    }
    if (!response.ok) {
      throw new InkstoneAccountError('AUTH_REJECTED', `The authentication service returned status ${response.status}.`)
    }
    try {
      return (await response.json()) as unknown
    } catch (cause) {
      throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'The authentication response was not JSON.', { cause })
    }
  }
}
