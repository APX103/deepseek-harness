/**
 * The pure account session: token cache, sign-in flows, and optional
 * persistence. Framework-free so tests drive it without a Cordis context;
 * the Cordis service in `service.ts` is a thin shell over this.
 *
 * @module dsh-inkstone-account/session
 */
import type { Config } from './config.ts'
import { InkstoneAccountError } from './errors.ts'
import { jwtExpiresAtMs } from './jwt.ts'
import { AuthApiClient } from './api-client.ts'
import type { AuthFetch } from './api-client.ts'
import { UaaPasswordClient } from './password-login.ts'
import type { InkstoneUser } from './protocol.ts'

/** The stored grant payload persisted through the credentials seam. */
export interface StoredGrant {
  readonly version: 1
  readonly token: string
  readonly user?: InkstoneUser
}

/** Persistence seam; `undefined` operations mean "no durable store available". */
export interface GrantStore {
  read(): Promise<StoredGrant | undefined>
  write(grant: StoredGrant): Promise<void>
  clear(): Promise<void>
}

/** What one completed sign-in reports. */
export interface InkstoneAccountView {
  readonly user: InkstoneUser | undefined
  readonly expiresAtMs: number
}

/** Live sign-in state. */
export interface InkstoneAccountState {
  readonly authenticated: boolean
  readonly user: InkstoneUser | undefined
  readonly expiresAtMs: number | undefined
}

/** Injectable session dependencies. */
export interface AccountSessionDeps {
  readonly config: Config
  readonly fetch: AuthFetch
  readonly store?: GrantStore
  readonly now?: () => number
}

/** The account session logic. */
export class AccountSession {
  readonly #api: AuthApiClient
  readonly #uaa: UaaPasswordClient
  readonly #store: GrantStore | undefined
  readonly #now: () => number
  #token: { jwt: string; expiresAtMs: number; user: InkstoneUser | undefined } | undefined

  constructor(deps: AccountSessionDeps) {
    this.#api = new AuthApiClient(
      deps.now === undefined
        ? { config: deps.config, fetch: deps.fetch }
        : { config: deps.config, fetch: deps.fetch, now: deps.now },
    )
    this.#uaa = new UaaPasswordClient({ config: deps.config, fetch: deps.fetch })
    this.#store = deps.store
    this.#now = deps.now ?? Date.now
  }

  /** Adopt a persisted grant when its token is still unexpired. */
  async restore(): Promise<void> {
    const grant = await this.#store?.read()
    if (grant === undefined) return
    // The record crosses a persistence boundary, so it is validated as
    // untrusted data rather than trusted as its declared type.
    const record = grant as unknown as Record<string, unknown>
    if (record['version'] !== 1 || typeof record['token'] !== 'string') return
    try {
      const expiresAtMs = jwtExpiresAtMs(record['token'])
      if (this.#now() >= expiresAtMs) return
      this.#token = { jwt: record['token'], expiresAtMs, user: record['user'] as InkstoneUser | undefined }
    } catch {
      // A malformed stored grant is ignored, not fatal.
    }
  }

  /** Current state without network activity. */
  state(): InkstoneAccountState {
    const usable = this.#token !== undefined && this.#now() < this.#token.expiresAtMs
    return {
      authenticated: usable,
      user: usable ? this.#token?.user : undefined,
      expiresAtMs: usable ? this.#token?.expiresAtMs : undefined,
    }
  }

  /** Sign in with username and password (uaa `byAccount`). */
  async signInWithPassword(username: string, password: string): Promise<InkstoneAccountView> {
    return this.#complete(await this.#uaa.signInWithPassword(username, password))
  }

  /** Complete a browser-based sign-in from its `uaa::code::` grant. */
  async signInWithCode(code: string): Promise<InkstoneAccountView> {
    return this.#complete(code)
  }

  /** The usable bearer token, or `undefined` when signed out or expired. */
  resolveToken(): Promise<string | undefined> {
    if (this.#token === undefined || this.#now() >= this.#token.expiresAtMs) return Promise.resolve(undefined)
    return Promise.resolve(this.#token.jwt)
  }

  /** Drop the cached token when a request rejected exactly it. */
  async rejectToken(token: string): Promise<void> {
    if (this.#token?.jwt === token) {
      this.#token = undefined
      await this.#store?.clear().catch(() => undefined)
    }
  }

  /** Revoke the token server-side and clear the session. */
  async signOut(): Promise<void> {
    const token = this.#token?.jwt
    this.#token = undefined
    await this.#store?.clear().catch(() => undefined)
    if (token !== undefined) {
      await this.#api.logout(token).catch(() => undefined)
    }
  }

  async #complete(code: string): Promise<InkstoneAccountView> {
    const jwt = await this.#api.exchangeCode(code)
    const expiresAtMs = jwtExpiresAtMs(jwt)
    // A profile read failure never blocks sign-in (the desktop's "refresh
    // failure does not sign out" rule); the account is usable without it.
    const user = await this.#api.getUserInfo(jwt).catch(() => undefined)
    this.#token = { jwt, expiresAtMs, user }
    await this.#store?.write({ version: 1, token: jwt, ...(user !== undefined ? { user } : {}) }).catch(() => undefined)
    return { user, expiresAtMs }
  }
}

export { InkstoneAccountError }
