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
    await expect(new TokenPlanClient({ config, fetch: numeric.fetchImpl }).balance('jwt')).resolves.toEqual({ credits: 12.5, windows: [], effectiveCredits: 12.5 })
    const textual = route(() => ok({ available_credits: '3.25' }))
    await expect(new TokenPlanClient({ config, fetch: textual.fetchImpl }).balance('jwt')).resolves.toEqual({ credits: 3.25, windows: [], effectiveCredits: 3.25 })
    expect(formatInkstoneCredits(3.25)).toBe('3.250')
    expect(formatInkstoneCredits(NaN)).toBe('0.000')
  })

  it('parses enabled usage windows and caps the effective balance', async () => {
    const full = route(() => ok({
      available_credits: '9791.883',
      usage_windows: {
        '5h': { enabled: true, limit_credits: '1000.000', used_credits: '400.000', remaining_credits: '600.000', next_recover_at: '2026-11-18 15:00:41' },
        '7d': { enabled: true, limit_credits: '4000.000', used_credits: '0.000', remaining_credits: '4000.000', next_recover_at: '2026-11-24 20:00:41' },
        off: { enabled: false, limit_credits: '1.000', used_credits: '0.000', remaining_credits: '1.000' },
      },
    }))
    await expect(new TokenPlanClient({ config, fetch: full.fetchImpl }).balance('jwt')).resolves.toEqual({
      credits: 9791.883,
      effectiveCredits: 600,
      windows: [
        { id: '5h', limitCredits: 1000, usedCredits: 400, remainingCredits: 600, nextRecoverAt: '2026-11-18 15:00:41' },
        { id: '7d', limitCredits: 4000, usedCredits: 0, remainingCredits: 4000, nextRecoverAt: '2026-11-24 20:00:41' },
      ],
    })
    const malformed = route(() => ok({
      available_credits: '10',
      usage_windows: {
        '5h': { enabled: true, limit_credits: 'NaN', used_credits: '0.000', remaining_credits: '1.000' },
        bad: 'not-a-row',
      },
    }))
    await expect(new TokenPlanClient({ config, fetch: malformed.fetchImpl }).balance('jwt')).resolves.toEqual({ credits: 10, windows: [], effectiveCredits: 10 })
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

describe('transactions and packages', () => {
  const txEnvelope = {
    total: 14,
    items: [
      {
        occurred_at: '2026-11-18',
        income_expense_type: 'consume',
        income_expense_type_name: '消费',
        income_expense_type_name_en: 'Usage',
        consume_channel: 'chat',
        consume_channel_name: '对话消费',
        consume_channel_name_en: 'Chat usage',
        credit_delta: '-1.673',
        remark: 'TokenPlan模型调用-GLM-5.3-3rd',
        remark_en: 'TokenPlan model call-GLM-5.3-3rd',
        pkg_id: '',
        model: 'glm-5.3-3rd',
        request_count: 2,
      },
      { occurred_at: 'bad-row' },
    ],
  }
  const pkgEnvelope = {
    total: 1,
    packages: [
      {
        pkg_id: 'pkg_free_monthly_base',
        issued_at: '2026-11-03 20:00:41',
        cycle_type: 'monthly',
        current_cycle: { start_at: '2026-11-03 20:00:41', end_at: '2026-12-04 00:00:00' },
        total_credits: '10000.000',
        remaining_credits: '9790.210',
        status: 'available',
        income_expense_type: 'platform_grant',
        income_expense_type_name: '平台发放',
        remark: '每月免费基础包',
        effective_at: '2026-11-03 20:00:41',
        expire_at: '2099-12-31 23:59:59',
      },
    ],
  }

  it('parses one ledger page and drops malformed rows', async () => {
    const ledger = route(() => ok(txEnvelope))
    const page = await new TokenPlanClient({ config, fetch: ledger.fetchImpl }).transactions('jwt', '2026-11-01', '2026-11-18', 1)
    expect(page.total).toBe(14)
    expect(page.items).toEqual([{
      occurredAt: '2026-11-18',
      typeName: '消费',
      channelName: '对话消费',
      creditDelta: -1.673,
      remark: 'TokenPlan模型调用-GLM-5.3-3rd',
      model: 'glm-5.3-3rd',
    }])
  })

  it('parses 墨点包 grants with their cycle windows', async () => {
    const grants = route(() => ok(pkgEnvelope))
    const packages = await new TokenPlanClient({ config, fetch: grants.fetchImpl }).packages('jwt')
    expect(packages).toEqual([{
      pkgId: 'pkg_free_monthly_base',
      cycleType: 'monthly',
      cycleStart: '2026-11-03 20:00:41',
      cycleEnd: '2026-12-04 00:00:00',
      totalCredits: 10000,
      remainingCredits: 9790.21,
      status: 'available',
      kindName: '平台发放',
      remark: '每月免费基础包',
      expireAt: '2099-12-31 23:59:59',
    }])
  })

  it('returns empty pages on malformed envelopes', async () => {
    const bad = route(() => ok({ items: 'nope', total: 'NaN' }))
    await expect(new TokenPlanClient({ config, fetch: bad.fetchImpl }).transactions('jwt', 'a', 'b', 1))
      .resolves.toEqual({ total: 0, items: [] })
    const noPackages = route(() => ok({ packages: null }))
    await expect(new TokenPlanClient({ config, fetch: noPackages.fetchImpl }).packages('jwt')).resolves.toEqual([])
  })
})
