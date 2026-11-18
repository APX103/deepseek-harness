/**
 * Service shell tests against a real Cordis context: every method must work
 * when invoked through the `ctx.inkstoneAccount` proxy, whose shadow `this`
 * breaks ECMAScript `#` fields (cordis replaces the receiver with a proxy).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { InkstoneAccount } from '../src/service.ts'

const config = {
  authBaseUrl: 'https://unit.example/api',
  ssoOrigin: 'https://sso.example',
  clientId: 'client-id-01',
  source: 'discovery',
  redirectUrl: 'https://unit.example/',
  requestTimeoutMs: 1_000,
}

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

it('serves state and deployment through the ctx service proxy', async () => {
  ctx = new Context()
  const owner = ctx.plugin(InkstoneAccount, config)
  await owner.await()
  expect(await ctx.inkstoneAccount.state()).toEqual({ authenticated: false, user: undefined, expiresAtMs: undefined })
  expect(ctx.inkstoneAccount.deployment()).toEqual({
    ssoOrigin: config.ssoOrigin,
    clientId: config.clientId,
    source: config.source,
    redirectUrl: config.redirectUrl,
  })
  await expect(ctx.inkstoneAccount.resolveToken()).resolves.toBeUndefined()
  await ctx.inkstoneAccount.rejectToken('stale')
  await ctx.inkstoneAccount.signOut()
})

it('resolves the Config schema defaults when the entry declares no config', async () => {
  ctx = new Context()
  const owner = ctx.plugin(InkstoneAccount)
  await owner.await()
  expect(ctx.inkstoneAccount.deployment()).toEqual({
    ssoOrigin: 'https://sso.staging.openxlab.org.cn',
    clientId: '05wrodmwk4z3mze13kmy',
    source: 'discovery',
    redirectUrl: 'https://discovery-staging.intern-ai.org.cn/',
  })
})
