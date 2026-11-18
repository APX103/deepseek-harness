/**
 * Inkstone gateway failure mapping: HTTP rejections and SSE `error` events
 * onto harness failure codes, including the Token Plan business codes.
 *
 * Codes and status pairing follow intern-inkstone `cloud-gateway.ts`
 * (`tokenPlanFailureCodeFromRejection`, `tokenPlanFailureStatus`) and
 * `@shared/token-plan-failure.ts`: 403005 pairs with 403, 429004/429005 with
 * 429, and both are final — they never carry retry authority.
 *
 * The harness failure vocabulary is the closed builtin set plus `HTTP_<n>`,
 * so the mapping stays inside it: Token Plan rejections surface as
 * `ACCOUNT_QUOTA` (the Inkstone balance is the account quota), a rejected
 * sign-in as `ACCOUNT_TOKEN_INVALID`, missing sign-in as
 * `ACCOUNT_SIGN_IN_REQUIRED`, and unclassified rejections as `HTTP_<status>`.
 * The specific gateway code (for example `403005`) always rides in the
 * message; the M3 Token Plan surface keys on it for presentation.
 *
 * @module dsh-llm-inkstone/failure
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { OrbitSseEvent } from './protocol.ts'

/** Token Plan rejection codes surfaced by the orbit gateway. */
export const TOKEN_PLAN_FAILURE_CODES = ['403005', '429004', '429005'] as const
export type TokenPlanFailureCode = (typeof TOKEN_PLAN_FAILURE_CODES)[number]

const TOKEN_PLAN_FAILURE_STATUS: Readonly<Record<TokenPlanFailureCode, number>> = {
  '403005': 403,
  '429004': 429,
  '429005': 429,
}

function readCodeFields(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const data = record['data']
  const candidates = [
    record['code'],
    record['error_code'],
    record['errorCode'],
    record['reason'],
    record['reason_code'],
    record['reasonCode'],
    ...(data !== null && typeof data === 'object'
      ? [(data as Record<string, unknown>)['code'], (data as Record<string, unknown>)['reason']]
      : []),
  ]
  return candidates
    .filter((candidate): candidate is string | number => typeof candidate === 'string' || typeof candidate === 'number')
    .map(candidate => String(candidate))
}

/** The Token Plan code carried by a rejection envelope, when any matches the closed set. */
export function tokenPlanFailureCode(envelope: unknown): TokenPlanFailureCode | undefined {
  const candidates = readCodeFields(envelope)
  return TOKEN_PLAN_FAILURE_CODES.find(failure => candidates.includes(failure))
}

function failureOf(message: string, code: `HTTP_${number}` | 'ACCOUNT_QUOTA' | 'ACCOUNT_TOKEN_INVALID' | 'RATE_LIMIT' | 'SERVER' | 'INVALID_RESPONSE', status?: number): LlmError {
  return new LlmError(message, code, status !== undefined ? { status } : {})
}

/** Best-effort window facts from a rejection envelope's `data` (field names verified live when available). */
function readWindowFacts(envelope: unknown): { window: string; recoverAt?: string } | undefined {
  if (envelope === null || typeof envelope !== 'object') return undefined
  const data = (envelope as Record<string, unknown>)['data']
  if (data === null || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  const windowId = record['window'] ?? record['window_id'] ?? record['usage_window']
  if (typeof windowId !== 'string' || windowId === '') return undefined
  const recoverAt = record['next_recover_at'] ?? record['recover_at'] ?? record['recover_time']
  return {
    window: windowId,
    ...(typeof recoverAt === 'string' && recoverAt !== '' ? { recoverAt } : {}),
  }
}

/** Map one non-SSE HTTP rejection body onto the failure vocabulary. */
export function rejectionFailure(status: number, envelope: unknown): LlmError {
  const tokenPlan = tokenPlanFailureCode(envelope)
  if (tokenPlan === '429005' && TOKEN_PLAN_FAILURE_STATUS[tokenPlan] === status) {
    // The gateway's own retryable flag refers to immediate re-dispatch; the
    // message invites retrying later, which the harness retry layer paces.
    return failureOf('Token Plan user rate limit reached; retry later.', 'RATE_LIMIT', status)
  }
  if (tokenPlan !== undefined && TOKEN_PLAN_FAILURE_STATUS[tokenPlan] === status) {
    const facts = readWindowFacts(envelope)
    const message = facts === undefined
      ? `Token Plan rejected the request (code ${tokenPlan}). Check the Inkstone balance or apply for more credits.`
      : `Token Plan window exhausted (code ${tokenPlan}, window ${facts.window}`
        + (facts.recoverAt !== undefined ? `, recovers ${facts.recoverAt}` : '')
        + ').'
    return failureOf(message, 'ACCOUNT_QUOTA', status)
  }
  if (status === 401) {
    return failureOf('The Inkstone sign-in was rejected. Sign in again.', 'ACCOUNT_TOKEN_INVALID', status)
  }
  if (status === 429) {
    return failureOf('The Inkstone gateway rate-limited the request.', 'RATE_LIMIT', status)
  }
  if (status === 503) {
    return failureOf('The Inkstone gateway is temporarily unavailable.', 'SERVER', status)
  }
  return failureOf('The Inkstone gateway rejected the request.', `HTTP_${status}`, status)
}

/** Map one SSE `error` event onto the failure vocabulary. */
export function sseErrorFailure(event: OrbitSseEvent): LlmError {
  const code = event.code !== undefined ? String(event.code) : undefined
  if (code === '429005') {
    return failureOf('Token Plan user rate limit reached; retry later.', 'RATE_LIMIT')
  }
  if (code !== undefined && (TOKEN_PLAN_FAILURE_CODES as readonly string[]).includes(code)) {
    return failureOf(
      `Token Plan rejected the inference (code ${code}). Check the Inkstone balance or apply for more credits.`,
      'ACCOUNT_QUOTA',
    )
  }
  const message = typeof event.message === 'string' && event.message !== '' ? event.message : 'The Inkstone inference stream failed.'
  return failureOf(message, event.retryable === true ? 'SERVER' : 'INVALID_RESPONSE')
}
