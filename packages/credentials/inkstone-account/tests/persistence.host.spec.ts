/**
 * Persistence integration: the InkstoneAccount service writes the grant
 * through the real credentials-local provider into the document on disk, and
 * a second boot restores it.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { afterEach, expect, it } from 'vitest'
import { jwtExpiresAtMs } from '../src/jwt.ts'
import { InkstoneAccount } from '../src/service.ts'

const config = {
  authBaseUrl: 'https://unit.example/api',
  ssoOrigin: 'https://sso.example',
  clientId: 'client-id-01',
  source: 'discovery',
  redirectUrl: 'https://unit.example/',
  requestTimeoutMs: 1_000,
}

function fetchStub(): typeof fetch {
  const jwt = 'header.'
    + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
    + '.signature'
  return (async () => new Response(JSON.stringify({ code: 0, data: { token: jwt } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch
}

let dir: string | undefined
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

it('persists the grant through credentials-local and restores it on the next boot', async () => {
  dir = await mkdtemp(join(tmpdir(), 'inkstone-grant-'))
  const document = join(dir, '.credentials.yaml')

  // First boot: sign in, then confirm the document carries the grant.
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchStub() as typeof fetch
  try {
    ctx = new Context()
    const credentialsOwner = ctx.plugin(LocalCredentialProvider, { path: document, watch: false })
    const accountOwner = ctx.plugin(InkstoneAccount, config)
    await Promise.all([credentialsOwner.await(), accountOwner.await()])
    await ctx.inkstoneAccount.signInWithCode('uaa::code::unit')
  } finally {
    globalThis.fetch = originalFetch
  }
  const text = await readFile(document, 'utf8')
  expect(text).toContain('inkstone-account/default')
  const jwt = await ctx.inkstoneAccount.resolveToken()
  expect(jwt).not.toBeUndefined()
  await ctx.fiber.dispose()
  ctx = undefined

  // Second boot: the stored grant restores the session without any sign-in.
  ctx = new Context()
  await ctx.plugin(LocalCredentialProvider, { path: document, watch: false }).await()
  await ctx.plugin(InkstoneAccount, config).await()
  const restored = await ctx.inkstoneAccount.resolveToken()
  expect(restored).toBe(jwt)
  await expect(ctx.inkstoneAccount.state()).resolves.toMatchObject({ authenticated: true })
  expect(jwtExpiresAtMs(jwt!)).toBeGreaterThan(Date.now())
})

it('restores the grant when the credentials provider activates after the account service', async () => {
  dir = await mkdtemp(join(tmpdir(), 'inkstone-grant-late-'))
  const document = join(dir, '.credentials.yaml')
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchStub() as typeof fetch
  let first: Context
  try {
    // Boot one: only the account service — persistence is off, sign-in is memory-only.
    first = new Context()
    await first.plugin(InkstoneAccount, config).await()
    await first.inkstoneAccount.signInWithCode('uaa::code::unit')
  } finally {
    globalThis.fetch = originalFetch
  }
  // Persist the memory grant as boot one would have written it.
  const jwt = await first.inkstoneAccount.resolveToken()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(document, `version: 1\nrecords:\n  inkstone-account/default:\n    kind: grant\n    payload:\n      version: 1\n      token: ${jwt}\n`, { mode: 0o600 })
  await first.fiber.dispose()

  // Boot two: the account service constructs before the provider's document load.
  ctx = new Context()
  await ctx.plugin(InkstoneAccount, config).await()
  await ctx.plugin(LocalCredentialProvider, { path: document, watch: false }).await()
  await expect(ctx.inkstoneAccount.state()).resolves.toMatchObject({ authenticated: true })
})
