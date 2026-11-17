/**
 * The Cordis service shell: `ctx.inkstoneTokenPlan` over the platform
 * client, authenticated by the inkstone account service with the
 * `INKSTONE_JWT` environment as fallback.
 *
 * @module dsh-inkstone-token-plan/service
 */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { TokenPlanClient } from './client.ts'
import type {
  CreditIncreaseApplication,
  CreditIncreaseScenario,
  FreeGrantOutcome,
  TokenPlanBalance,
  TokenPlanFetch,
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
  (): string | undefined
}

/** Injectable service dependencies. */
export interface InkstoneTokenPlanDeps {
  readonly resolveToken: TokenPlanTokenSource
  readonly resolveSsoUid: TokenPlanIdentitySource
  readonly fetch?: TokenPlanFetch
}

/**
 * The Inkstone Token Plan service: 墨点 balance, free-grant, and
 * credit-increase operations behind the signed-in account.
 */
export class InkstoneTokenPlan extends Service {
  readonly #client: TokenPlanClient
  readonly #resolveToken: TokenPlanTokenSource
  readonly #resolveSsoUid: TokenPlanIdentitySource

  constructor(ctx: Context, config: Config, deps?: InkstoneTokenPlanDeps) {
    super(ctx, 'inkstoneTokenPlan')
    const fetchImpl: TokenPlanFetch = deps?.fetch ?? ((input, init) => fetch(input, init))
    this.#resolveToken = deps?.resolveToken ?? (() => Promise.resolve(undefined))
    this.#resolveSsoUid = deps?.resolveSsoUid ?? (() => undefined)
    this.#client = new TokenPlanClient({ config, fetch: fetchImpl })
  }

  /** The 墨点 balance of the signed-in account. */
  async balance(signal?: AbortSignal): Promise<TokenPlanBalance> {
    return this.#client.balance(await this.#token(), signal)
  }

  /** Whether the account has received the free 墨点 grant. */
  async freeGrantStatus(signal?: AbortSignal): Promise<FreeGrantOutcome> {
    return this.#client.freeGrantStatus(await this.#token(), this.#requireSsoUid(), signal)
  }

  /** Claim the free 墨点 grant for a bound-phone account. */
  async claimFreeGrant(signal?: AbortSignal): Promise<FreeGrantOutcome> {
    return this.#client.claimFreeGrant(await this.#token(), this.#requireSsoUid(), signal)
  }

  /** The selectable credit-increase scenario tree. */
  async creditIncreaseScenarios(signal?: AbortSignal): Promise<readonly CreditIncreaseScenario[]> {
    return this.#client.creditIncreaseScenarios(await this.#token(), signal)
  }

  /** The account's submitted credit-increase applications. */
  async creditIncreaseApplications(signal?: AbortSignal): Promise<readonly CreditIncreaseApplication[]> {
    return this.#client.creditIncreaseApplications(await this.#token(), signal)
  }

  /** Submit one credit-increase application. */
  async applyCreditIncrease(scenarioId: string, reason: string, signal?: AbortSignal): Promise<CreditIncreaseApplication> {
    return this.#client.applyCreditIncrease(await this.#token(), scenarioId, reason, signal)
  }

  async #token(): Promise<string> {
    const token = await this.#resolveToken()
    if (token === undefined || token === '') {
      throw new TokenPlanError('TOKEN_PLAN_UNAUTHORIZED', 'Sign in to read the Token Plan.')
    }
    return token
  }

  #requireSsoUid(): string {
    const ssoUid = this.#resolveSsoUid()
    if (ssoUid === undefined || ssoUid === '') {
      throw new TokenPlanError('TOKEN_PLAN_UNAUTHORIZED', 'The free grant requires a signed-in account profile.')
    }
    return ssoUid
  }
}
