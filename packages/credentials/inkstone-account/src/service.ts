/**
 * The Cordis service shell over {@link AccountSession}: registers
 * `ctx.inkstoneAccount` and persists the grant through the credentials seam
 * when a `credentials` provider is present.
 *
 * @module dsh-inkstone-account/service
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider, GrantRecord } from '@deepseek-ai/dsh-credentials'
import type { Config } from './config.ts'
import { AccountSession } from './session.ts'
import type { GrantStore, InkstoneAccountState, InkstoneAccountView, StoredGrant } from './session.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Inkstone account service (KEP-0002 M2). */
    inkstoneAccount: InkstoneAccount
  }
}

const KEY = credentialKey('inkstone-account', 'default')

function grantStoreOf(ctx: Context): GrantStore | undefined {
  const provider: CredentialProvider | undefined = ctx.get('credentials')
  if (provider === undefined) return undefined
  return {
    async read(): Promise<StoredGrant | undefined> {
      const record = await provider.readRecord(KEY)
      if (record === undefined || record.kind !== 'grant') return undefined
      const payload: unknown = record.payload
      if (payload === null || typeof payload !== 'object') return undefined
      const candidate = payload as Record<string, unknown>
      if (candidate['version'] !== 1 || typeof candidate['token'] !== 'string') return undefined
      return payload as StoredGrant
    },
    async write(grant: StoredGrant): Promise<void> {
      await provider.modifyRecord(KEY, () => Promise.resolve({ kind: 'grant', payload: grant }) satisfies Promise<GrantRecord>)
    },
    async clear(): Promise<void> {
      await provider.deleteRecord(KEY)
    },
  }
}

/**
 * The Inkstone account service: unit SSO sign-in (password or code), the
 * sanitized profile, and bearer-JWT resolution for the llm-inkstone route.
 */
export class InkstoneAccount extends Service {
  readonly #session: AccountSession

  constructor(ctx: Context, config: Config) {
    super(ctx, 'inkstoneAccount')
    const fetchImpl = (input: string, init: RequestInit) => fetch(input, init)
    const store = grantStoreOf(ctx)
    this.#session = new AccountSession(
      store === undefined ? { config, fetch: fetchImpl } : { config, fetch: fetchImpl, store },
    )
    void this.#session.restore()
  }

  /** Current sign-in state without network activity. */
  state(): InkstoneAccountState {
    return this.#session.state()
  }

  /** Sign in with username and password (uaa `byAccount`). */
  signInWithPassword(username: string, password: string): Promise<InkstoneAccountView> {
    return this.#session.signInWithPassword(username, password)
  }

  /** Complete a browser-based sign-in from its `uaa::code::` grant. */
  signInWithCode(code: string): Promise<InkstoneAccountView> {
    return this.#session.signInWithCode(code)
  }

  /** The usable bearer JWT, or `undefined` when signed out or expired. */
  resolveToken(): Promise<string | undefined> {
    return this.#session.resolveToken()
  }

  /** Drop the cached token when a request rejected exactly it. */
  rejectToken(token: string): Promise<void> {
    return this.#session.rejectToken(token)
  }

  /** Revoke the token server-side and clear the session. */
  signOut(): Promise<void> {
    return this.#session.signOut()
  }
}
