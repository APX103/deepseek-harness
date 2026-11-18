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
import { Config } from './config.ts'
import type { InkstoneSsoDeployment } from './config.ts'
import { AccountSession } from './session.ts'
import type { GrantStore, InkstoneAccountState, InkstoneAccountView, StoredGrant } from './session.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Inkstone account service (KEP-0002 M2). */
    inkstoneAccount: InkstoneAccount
  }
}

const KEY = credentialKey('inkstone-account', 'default')

function grantStoreOf(ctx: Context): GrantStore {
  // Resolve the provider lazily per operation: the service constructor can
  // run before the credentials provider's fiber has activated, which would
  // otherwise drop grant persistence for the whole process.
  const provider = (): CredentialProvider | undefined => ctx.get('credentials')
  return {
    async read(): Promise<StoredGrant | undefined> {
      const record = await provider()?.readRecord(KEY)
      if (record === undefined || record.kind !== 'grant') return undefined
      const payload: unknown = record.payload
      if (payload === null || typeof payload !== 'object') return undefined
      const candidate = payload as Record<string, unknown>
      if (candidate['version'] !== 1 || typeof candidate['token'] !== 'string') return undefined
      return payload as StoredGrant
    },
    async write(grant: StoredGrant): Promise<void> {
      const target = provider()
      if (target === undefined) throw new Error('the credentials provider is unavailable')
      await target.modifyRecord(KEY, () => Promise.resolve({ kind: 'grant', payload: grant }) satisfies Promise<GrantRecord>)
    },
    async clear(): Promise<void> {
      await provider()?.deleteRecord(KEY)
    },
  }
}

/**
 * The Inkstone account service: unit SSO sign-in (password or code), the
 * sanitized profile, and bearer-JWT resolution for the llm-inkstone route.
 */
export class InkstoneAccount extends Service {
  static Config = Config

  // TypeScript `private`, not ECMAScript `#`: cordis service calls run with a
  // shadow `this`, and `#` fields fail the proxy brand check on any method
  // invoked through `ctx.inkstoneAccount`.
  private readonly session: AccountSession
  private readonly config: Config
  /**
   * Serialized idempotent grant restores. The constructor attempt usually
   * loses the race against the credentials provider's asynchronous document
   * load, so the restore re-runs when that fiber turns ACTIVE
   * (`internal/service`); every token-reading method awaits the chain, which
   * keeps cold-boot callers from observing the pre-restore signed-out state.
   */
  private restoreChain: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'inkstoneAccount')
    this.config = config
    const fetchImpl = (input: string, init: RequestInit) => fetch(input, init)
    this.session = new AccountSession({ config, fetch: fetchImpl, store: grantStoreOf(ctx) })
    this.enqueueRestore()
    this.restoreChain.catch(() => undefined)
    ctx.effect(() => ctx.on('internal/service', (name: string) => {
      if (name === 'credentials') this.enqueueRestore()
    }), 'inkstone-account: restore when credentials activates')
  }

  /** Queue one idempotent grant restore behind any in-flight one. */
  private enqueueRestore(): void {
    this.restoreChain = this.restoreChain.then(() => this.session.restore())
  }

  /** The SSO OAuth facts the page sign-in URL and callback check read (KEP-0003). */
  deployment(): InkstoneSsoDeployment {
    return {
      ssoOrigin: this.config.ssoOrigin,
      clientId: this.config.clientId,
      source: this.config.source,
      redirectUrl: this.config.redirectUrl,
    }
  }

  /** Current sign-in state without network activity; waits for the stored grant restore. */
  async state(): Promise<InkstoneAccountState> {
    await this.restoreChain
    return this.session.state()
  }

  /** Sign in with username and password (uaa `byAccount`). */
  async signInWithPassword(username: string, password: string): Promise<InkstoneAccountView> {
    await this.restoreChain
    return this.session.signInWithPassword(username, password)
  }

  /** Complete a browser-based sign-in from its `uaa::code::` grant. */
  async signInWithCode(code: string): Promise<InkstoneAccountView> {
    await this.restoreChain
    return this.session.signInWithCode(code)
  }

  /** The usable bearer JWT, or `undefined` when signed out or expired. */
  async resolveToken(): Promise<string | undefined> {
    await this.restoreChain
    return this.session.resolveToken()
  }

  /** Drop the cached token when a request rejected exactly it. */
  async rejectToken(token: string): Promise<void> {
    await this.restoreChain
    return this.session.rejectToken(token)
  }

  /** Revoke the token server-side and clear the session. */
  async signOut(): Promise<void> {
    await this.restoreChain
    return this.session.signOut()
  }
}
