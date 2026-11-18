/**
 * The Cordis service shell: `ctx.inkstoneTokenPlan` over the platform
 * client, authenticated by the inkstone account service with the
 * `INKSTONE_JWT` environment as fallback.
 *
 * @module dsh-inkstone-token-plan/service
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { TokenPlanClient } from './client.ts'
import type {
  CreditIncreaseApplication,
  CreditIncreaseScenario,
  FreeGrantOutcome,
  TokenPlanBalance,
  TokenPlanFetch,
  TokenPlanPackage,
  TokenPlanTransactionPage,
} from './client.ts'
import { TokenPlanError } from './errors.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Inkstone Token Plan service (KEP-0002 M3). */
    inkstoneTokenPlan: InkstoneTokenPlan
  }
}

/** Injectable token source: the account service, with an environment fallback. */
export interface TokenPlanTokenSource {
  (): Promise<string | undefined>
}

/** Injectable ssoUid source for the free-grant `id` header. */
export interface TokenPlanIdentitySource {
  (): Promise<string | undefined>
}

/** Injectable service dependencies. */
export interface InkstoneTokenPlanDeps {
  readonly resolveToken: TokenPlanTokenSource
  readonly resolveSsoUid: TokenPlanIdentitySource
  readonly fetch?: TokenPlanFetch
}

/** The account service surface this service resolves its identity from. */
interface InkstoneAccountLike {
  resolveToken?: () => Promise<string | undefined>
  state?: () => Promise<{ user?: { ssoUid?: string } }>
}

/**
 * The Inkstone Token Plan service: 墨点 balance, free-grant, and
 * credit-increase operations behind the signed-in account.
 */
export class InkstoneTokenPlan extends Service {
  static Config = Config

  // TypeScript `private`, not ECMAScript `#`: cordis service calls run with a
  // shadow `this`, and `#` fields fail the proxy brand check on any method
  // invoked through `ctx.inkstoneTokenPlan`.
  private readonly client: TokenPlanClient
  private readonly resolveTokenSource: TokenPlanTokenSource
  private readonly resolveSsoUidSource: TokenPlanIdentitySource

  constructor(ctx: Context, config: Config, deps?: InkstoneTokenPlanDeps) {
    super(ctx, 'inkstoneTokenPlan')
    const fetchImpl: TokenPlanFetch = deps?.fetch ?? ((input, init) => fetch(input, init))
    // The package default-exports the class, so the loader instantiates this
    // as a class plugin with (ctx, config) only: identity defaults resolve
    // lazily from the inkstone-account service, and tests or embeddings can
    // inject their own sources through `deps`.
    const account = (): InkstoneAccountLike | undefined => ctx.get('inkstoneAccount') as never
    this.resolveTokenSource = deps?.resolveToken ?? (async () => {
      const fromService = await account()?.resolveToken?.()
      return fromService === '' ? undefined : fromService
    })
    this.resolveSsoUidSource = deps?.resolveSsoUid ?? (async () => (await account()?.state?.())?.user?.ssoUid)
    this.client = new TokenPlanClient({ config, fetch: fetchImpl })
  }

  /** The 墨点 balance of the signed-in account. */
  async balance(signal?: AbortSignal): Promise<TokenPlanBalance> {
    return this.client.balance(await this.token(), signal)
  }

  /** Whether the account has received the free 墨点 grant. */
  async freeGrantStatus(signal?: AbortSignal): Promise<FreeGrantOutcome> {
    return this.client.freeGrantStatus(await this.token(), await this.requireSsoUid(), signal)
  }

  /** Claim the free 墨点 grant for a bound-phone account. */
  async claimFreeGrant(signal?: AbortSignal): Promise<FreeGrantOutcome> {
    return this.client.claimFreeGrant(await this.token(), await this.requireSsoUid(), signal)
  }

  /** The selectable credit-increase scenario tree. */
  async creditIncreaseScenarios(signal?: AbortSignal): Promise<readonly CreditIncreaseScenario[]> {
    return this.client.creditIncreaseScenarios(await this.token(), signal)
  }

  /** One page of the 收支 ledger for a date range. */
  async transactions(
    startDate: string,
    endDate: string,
    page: number,
    pageSize?: number,
    signal?: AbortSignal,
  ): Promise<TokenPlanTransactionPage> {
    return this.client.transactions(await this.token(), startDate, endDate, page, pageSize, signal)
  }

  /** The account's 墨点包 grants with their cycle windows. */
  async packages(signal?: AbortSignal): Promise<readonly TokenPlanPackage[]> {
    return this.client.packages(await this.token(), signal)
  }

  /** The account's submitted credit-increase applications. */
  async creditIncreaseApplications(signal?: AbortSignal): Promise<readonly CreditIncreaseApplication[]> {
    return this.client.creditIncreaseApplications(await this.token(), signal)
  }

  /** Submit one credit-increase application. */
  async applyCreditIncrease(scenarioId: string, reason: string, signal?: AbortSignal): Promise<CreditIncreaseApplication> {
    return this.client.applyCreditIncrease(await this.token(), scenarioId, reason, signal)
  }

  async token(): Promise<string> {
    const token = await this.resolveTokenSource()
    if (token === undefined || token === '') {
      throw new TokenPlanError('TOKEN_PLAN_UNAUTHORIZED', 'Sign in to read the Token Plan.')
    }
    return token
  }

  async requireSsoUid(): Promise<string> {
    const ssoUid = await this.resolveSsoUidSource()
    if (ssoUid === undefined || ssoUid === '') {
      throw new TokenPlanError('TOKEN_PLAN_UNAUTHORIZED', 'The free grant requires a signed-in account profile.')
    }
    return ssoUid
  }
}
