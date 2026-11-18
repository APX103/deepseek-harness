/**
 * Service shell test against a real Cordis context: methods must work when
 * invoked through the `ctx.inkstoneTokenPlan` proxy, whose shadow `this`
 * breaks ECMAScript `#` fields (cordis replaces the receiver with a proxy).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { InkstoneTokenPlan } from '../src/service.ts'

const config = { apiBaseUrl: 'https://unit.example/api', requestTimeoutMs: 1_000 }

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

it('serves the balance through the ctx service proxy', async () => {
  ctx = new Context()
  new InkstoneTokenPlan(ctx, config, {
    resolveToken: () => Promise.resolve('jwt-token'),
    resolveSsoUid: async () => undefined,
    fetch: (async () => new Response(JSON.stringify({ code: 0, data: { available_credits: 12.5 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as never,
  })
  await expect(ctx.inkstoneTokenPlan.balance()).resolves.toEqual({ credits: 12.5, windows: [], effectiveCredits: 12.5 })
  await expect(ctx.inkstoneTokenPlan.freeGrantStatus()).rejects.toMatchObject({ code: 'TOKEN_PLAN_UNAUTHORIZED' })
})

it('class-plugin instantiation resolves identity from the inkstone-account service', async () => {
  const { InkstoneAccount } = await import('@deepseek-ai/dsh-inkstone-account')
  ctx = new Context()
  await ctx.plugin(InkstoneAccount, {
    authBaseUrl: 'https://unit.example/api', ssoOrigin: 'https://sso.example', clientId: 'c',
    source: 's', redirectUrl: 'https://unit.example/', requestTimeoutMs: 1_000,
  }).await()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ code: 0, data: { token: 'h.'
    + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.s' } }),
  { status: 200 })) as typeof fetch
  try {
    await ctx.inkstoneAccount.signInWithCode('uaa::code::unit')
  } finally {
    globalThis.fetch = originalFetch
  }
  ctx.plugin(InkstoneTokenPlan, config)
  await new Promise(resolve => setTimeout(resolve, 50))
  await expect(ctx.inkstoneTokenPlan.freeGrantStatus()).rejects.toMatchObject({ code: 'TOKEN_PLAN_UNAUTHORIZED' })
})
