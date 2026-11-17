/**
 * Token Plan platform client: the `/tokenplan/v1` operations ported from the
 * 书生·端砚 desktop web-api (`src/main/features/web-api/web-api.ts`). Response
 * contracts follow `docs/plans/2026-11-02-token-plan-entry.md`: balance's
 * `available_credits` arrives as string or number and must be a finite
 * non-negative value; the free-grant pair requires the verified `ssoUid` in
 * the `id` request header.
 *
 * @module dsh-inkstone-token-plan/client
 */
import type { Config } from './config.ts'
import { TokenPlanError } from './errors.ts'

export type TokenPlanFetch = (input: string, init: RequestInit) => Promise<Response>

/** Injectable client dependencies. */
export interface TokenPlanClientDeps {
  readonly config: Config
  readonly fetch: TokenPlanFetch
}

/** The 墨点 balance in credits. */
export interface TokenPlanBalance {
  readonly credits: number
}

/** Free-grant status or claim outcome. */
export interface FreeGrantOutcome {
  readonly hasReceived: boolean
}

/** One credit-increase scenario category. */
export interface CreditIncreaseScenario {
  readonly id: string
  readonly name: string
  readonly children: readonly { readonly id: string; readonly name: string }[]
}

/** One submitted credit-increase application. */
export interface CreditIncreaseApplication {
  readonly id: string
  readonly scenarioName: string
  readonly status: string
  readonly appliedAt: string
}

/** Client for the platform `/tokenplan/v1` surface. */
export class TokenPlanClient {
  readonly #deps: TokenPlanClientDeps

  constructor(deps: TokenPlanClientDeps) {
    this.#deps = deps
  }

  /** Read the 墨点 balance behind the bearer token. */
  async balance(token: string, signal?: AbortSignal): Promise<TokenPlanBalance> {
    const data = await this.#get('/tokenplan/v1/credits/balance', token, undefined, signal)
    const raw = fieldOf(data, 'available_credits')
    const credits = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
    if (!Number.isFinite(credits) || credits < 0) {
      throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The balance response carried no usable available_credits.')
    }
    return { credits }
  }

  /** Whether the account has received the free 墨点 grant. */
  async freeGrantStatus(token: string, ssoUid: string, signal?: AbortSignal): Promise<FreeGrantOutcome> {
    const data = await this.#get('/tokenplan/v1/users/free-grant-status', token, ssoUid, signal)
    return { hasReceived: booleanOf(fieldOf(data, 'has_received')) }
  }

  /** Claim the free 墨点 grant; only valid after a `has_received = false` status. */
  async claimFreeGrant(token: string, ssoUid: string, signal?: AbortSignal): Promise<FreeGrantOutcome> {
    const data = await this.#post('/tokenplan/v1/users/free-grant', token, ssoUid, undefined, signal)
    return { hasReceived: booleanOf(fieldOf(data, 'has_received')) }
  }

  /** The selectable credit-increase scenario tree. */
  async creditIncreaseScenarios(token: string, signal?: AbortSignal): Promise<readonly CreditIncreaseScenario[]> {
    const data = await this.#get('/tokenplan/v1/credit-increase/scenarios', token, undefined, signal)
    const items = fieldOf(data, 'items')
    if (!Array.isArray(items)) {
      throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The scenarios response carried no items.')
    }
    return items.flatMap((item): CreditIncreaseScenario[] => {
      if (item === null || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const id = boundedText(record['id'], 120)
      const name = boundedText(record['name'], 200)
      if (id === '' || name === '') return []
      const children = Array.isArray(record['children'])
        ? (record['children'] as unknown[]).flatMap((child): { id: string; name: string }[] => {
          if (child === null || typeof child !== 'object') return []
          const childRecord = child as Record<string, unknown>
          const childId = boundedText(childRecord['id'], 120)
          const childName = boundedText(childRecord['name'], 200)
          return childId !== '' && childName !== '' ? [{ id: childId, name: childName }] : []
        })
        : []
      return children.length > 0 ? [{ id, name, children }] : []
    })
  }

  /** The account's submitted credit-increase applications. */
  async creditIncreaseApplications(token: string, signal?: AbortSignal): Promise<readonly CreditIncreaseApplication[]> {
    const data = await this.#get('/tokenplan/v1/credit-increase/applications', token, undefined, signal)
    const items = fieldOf(data, 'items')
    if (!Array.isArray(items)) return []
    return items.flatMap((item): CreditIncreaseApplication[] => {
      if (item === null || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const id = boundedText(record['id'], 120)
      if (id === '') return []
      return [
        {
          id,
          scenarioName: boundedText(record['scenario_name'] ?? record['scenarioName'], 200),
          status: boundedText(record['status'], 60),
          appliedAt: boundedText(record['created_at'] ?? record['appliedAt'], 60),
        },
      ]
    })
  }

  /** Submit one credit-increase application. */
  async applyCreditIncrease(token: string, scenarioId: string, reason: string, signal?: AbortSignal): Promise<CreditIncreaseApplication> {
    const data = await this.#post('/tokenplan/v1/credit-increase/apply', token, undefined, { scenario_id: scenarioId, reason }, signal)
    if (data === null || typeof data !== 'object') {
      throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The application response must be an object.')
    }
    const record = data as Record<string, unknown>
    const id = boundedText(record['id'], 120)
    if (id === '') {
      throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The application response carried no id.')
    }
    return {
      id,
      scenarioName: boundedText(record['scenario_name'] ?? record['scenarioName'], 200),
      status: boundedText(record['status'], 60),
      appliedAt: boundedText(record['created_at'] ?? record['appliedAt'], 60),
    }
  }

  async #get(path: string, token: string, ssoUid: string | undefined, signal?: AbortSignal): Promise<unknown> {
    return this.#request('GET', path, token, ssoUid, undefined, signal)
  }

  async #post(path: string, token: string, ssoUid: string | undefined, body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.#request('POST', path, token, ssoUid, body, signal)
  }

  async #request(method: 'GET' | 'POST', path: string, token: string, ssoUid: string | undefined, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(ssoUid !== undefined ? { id: ssoUid } : {}),
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    }
    let response: Response
    try {
      response = await this.#deps.fetch(`${this.#deps.config.apiBaseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: signal ?? AbortSignal.timeout(this.#deps.config.requestTimeoutMs),
      })
    } catch (cause) {
      throw new TokenPlanError('TOKEN_PLAN_NETWORK', 'The Token Plan service could not be reached.', { cause })
    }
    if (response.status === 401) {
      throw new TokenPlanError('TOKEN_PLAN_UNAUTHORIZED', 'The Token Plan request requires a sign-in.')
    }
    if (!response.ok) {
      throw new TokenPlanError('TOKEN_PLAN_REJECTED', `The Token Plan service returned status ${response.status}.`)
    }
    try {
      const envelope = (await response.json()) as unknown
      return unwrapPlatformEnvelope(envelope)
    } catch (cause) {
      if (cause instanceof TokenPlanError) throw cause
      throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The Token Plan response was not usable JSON.', { cause })
    }
  }
}

function unwrapPlatformEnvelope(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    throw new TokenPlanError('TOKEN_PLAN_RESPONSE_INVALID', 'The Token Plan response must be an object.')
  }
  const record = value as Record<string, unknown>
  const code = record['code']
  if (typeof code === 'number' && code !== 0 && code !== 200) {
    const message = typeof record['msg'] === 'string' && record['msg'] !== '' ? record['msg'] : `The Token Plan service returned code ${code}.`
    throw new TokenPlanError('TOKEN_PLAN_REJECTED', message)
  }
  return record['data'] ?? record
}

function fieldOf(data: unknown, field: string): unknown {
  if (data === null || typeof data !== 'object') return undefined
  return (data as Record<string, unknown>)[field]
}

function booleanOf(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
