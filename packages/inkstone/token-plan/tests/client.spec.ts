/**
 * Token Plan client tests over a mock fetch: balance normalization, the
 * free-grant `id` header, scenario parsing, apply payloads, and failures.
 */
import { describe, expect, it, vi } from 'vitest'
import { TokenPlanClient } from '../src/client.ts'
import type { Config } from '../src/config.ts'
import { TokenPlanError } from '../src/errors.ts'
import { formatInkstoneCredits } from '../src/format.ts'

const config: Config = {
  apiBaseUrl: 'https://api.example/api',
  requestTimeoutMs: 5_000,
}

interface Captured {
  url: string
  init: RequestInit
}

function route(responses: (captured: Captured) => Response) {
  const captured: Captured[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const entry = { url, init: init ?? {} }
    captured.push(entry)
    return responses(entry)
  })
  return { fetchImpl, captured }
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function failureOf(promise: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await promise
  } catch (error) {
    return error as TokenPlanError
  }
  throw new Error('expected a failure')
}

describe('inkstone token plan client', () => {
  it('normalizes the balance from string or number', async () => {
    const numeric = route(() => ok({ available_credits: 12.5 }))
    await expect(new TokenPlanClient({ config, fetch: numeric.fetchImpl }).balance('jwt')).resolves.toEqual({ credits: 12.5 })
    const textual = route(() => ok({ available_credits: '3.25' }))
    await expect(new TokenPlanClient({ config, fetch: textual.fetchImpl }).balance('jwt')).resolves.toEqual({ credits: 3.25 })
    expect(formatInkstoneCredits(3.25)).toBe('3.250')
    expect(formatInkstoneCredits(NaN)).toBe('0.000')
  })

  it('rejects unusable balances and envelope errors', async () => {
    await expect(failureOf(new TokenPlanClient({ config, fetch: route(() => ok({ available_credits: 'NaN' })).fetchImpl }).balance('jwt'))).resolves.toMatchObject({ code: 'TOKEN_PLAN_RESPONSE_INVALID' })
    await expect(failureOf(new TokenPlanClient({ config, fetch: route(() => ok({ available_credits: -1 })).fetchImpl }).balance('jwt'))).resolves.toMatchObject({ code: 'TOKEN_PLAN_RESPONSE_INVALID' })
    await expect(failureOf(new TokenPlanClient({ config, fetch: route(() => new Response(JSON.stringify({ code: 401, msg: 'no auth' }), { status: 200 })).fetchImpl }).balance('jwt'))).resolves.toMatchObject({ code: 'TOKEN_PLAN_REJECTED' })
    await expect(failureOf(new TokenPlanClient({ config, fetch: route(() => new Response('no', { status: 401 })).fetchImpl }).balance('jwt'))).resolves.toMatchObject({ code: 'TOKEN_PLAN_UNAUTHORIZED' })
    await expect(failureOf(new TokenPlanClient({ config, fetch: route(() => { throw new Error('offline') }).fetchImpl }).balance('jwt'))).resolves.toMatchObject({ code: 'TOKEN_PLAN_NETWORK' })
  })

  it('sends the ssoUid id header on the free-grant pair', async () => {
    const { fetchImpl, captured } = route(() => ok({ has_received: false }))
    const client = new TokenPlanClient({ config, fetch: fetchImpl })
    await expect(client.freeGrantStatus('jwt', 'u-1')).resolves.toEqual({ hasReceived: false })
    expect(String(captured[0]?.url)).toBe('https://api.example/api/tokenplan/v1/users/free-grant-status')
    expect((captured[0]?.init.headers as Record<string, string>)['id']).toBe('u-1')
    await expect(client.claimFreeGrant('jwt', 'u-1')).resolves.toEqual({ hasReceived: false })
    expect(String(captured[1]?.init.method)).toBe('POST')
  })

  it('parses the scenario tree and submits applications', async () => {
    const scenarios = route(() => ok({ items: [{ id: 's1', name: '科研', children: [{ id: 'c1', name: '论文' }] }, { id: 'bad' }] }))
    await expect(new TokenPlanClient({ config, fetch: scenarios.fetchImpl }).creditIncreaseScenarios('jwt')).resolves.toEqual([
      { id: 's1', name: '科研', children: [{ id: 'c1', name: '论文' }] },
    ])
    const apply = route(() => ok({ id: 'a1', scenario_name: '科研', status: 'pending', created_at: '2026-11-17' }))
    await expect(new TokenPlanClient({ config, fetch: apply.fetchImpl }).applyCreditIncrease('jwt', 's1', '需要更多')).resolves.toEqual({
      id: 'a1',
      scenarioName: '科研',
      status: 'pending',
      appliedAt: '2026-11-17',
    })
    const applyBody = apply.captured[0]?.init.body as string | undefined
    expect(JSON.parse(applyBody ?? '{}')).toEqual({ scenario_id: 's1', reason: '需要更多' })
  })
})
