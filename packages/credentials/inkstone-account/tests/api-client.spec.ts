/**
 * User-center api-client tests over a mock fetch: envelope parsing, JWT
 * extraction with expiry, profile sanitization, and failure classification.
 */
import { describe, expect, it, vi } from 'vitest'
import { AuthApiClient } from '../src/api-client.ts'
import type { Config } from '../src/config.ts'
import { InkstoneAccountError } from '../src/errors.ts'

const config: Config = {
  authBaseUrl: 'https://uc.example/api/user-center/v1',
  ssoOrigin: 'https://sso.example',
  clientId: 'client-1',
  source: 'discovery',
  redirectUrl: 'https://app.example/',
  requestTimeoutMs: 5_000,
}

function makeJwt(expiresAtMs: number): string {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: Math.floor(expiresAtMs / 1000) })}.${b64({ k: 'sig' })}`
}

const UNEXPIRED = makeJwt(Date.now() + 3_600_000)

function ok(envelope: unknown): Response {
  return new Response(JSON.stringify(envelope), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function failureOf(promise: Promise<unknown>): Promise<{ code?: string }> {
  try {
    await promise
  } catch (error) {
    return error as InkstoneAccountError
  }
  throw new Error('expected a failure')
}

describe('inkstone api client', () => {
  it('exchanges an sso code for an unexpired jwt', async () => {
    const fetchImpl = vi.fn(
      async (_input: string, _init?: RequestInit) => ok({ code: 0, data: { token: UNEXPIRED } }),
    )
    const client = new AuthApiClient({ config, fetch: fetchImpl })
    const token = await client.exchangeCode('uaa::code::abc')
    expect(token).toBe(UNEXPIRED)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://uc.example/api/user-center/v1/users/auth')
    const sentBody = fetchImpl.mock.calls[0]?.[1]?.body as string | undefined
    expect(JSON.parse(sentBody ?? '')).toEqual({ code: 'uaa::code::abc' })
  })

  it('rejects an expired token', async () => {
    const expired = makeJwt(Date.now() - 1_000)
    const client = new AuthApiClient({ config, fetch: vi.fn(async () => ok({ code: 0, data: { token: expired } })) })
    await expect(failureOf(client.exchangeCode('uaa::code::x'))).resolves.toMatchObject({ code: 'AUTH_EXPIRED' })
  })

  it('classifies envelope and transport failures', async () => {
    await expect(failureOf(new AuthApiClient({ config, fetch: vi.fn(async () => ok({ code: 500, msg: 'boom' })) }).exchangeCode('c'))).resolves.toMatchObject({ code: 'AUTH_SERVICE_RESPONSE_INVALID' })
    await expect(failureOf(new AuthApiClient({ config, fetch: vi.fn(async () => ok({ code: 0, data: {} })) }).exchangeCode('c'))).resolves.toMatchObject({ code: 'AUTH_SERVICE_RESPONSE_INVALID' })
    await expect(failureOf(new AuthApiClient({ config, fetch: vi.fn(async () => new Response('no', { status: 503 })) }).exchangeCode('c'))).resolves.toMatchObject({ code: 'AUTH_REJECTED' })
    await expect(failureOf(new AuthApiClient({ config, fetch: vi.fn(async () => { throw new Error('offline') }) }).exchangeCode('c'))).resolves.toMatchObject({ code: 'AUTH_NETWORK' })
  })

  it('sanitizes the profile with field fallbacks', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      ok({ code: 0, data: { sso_uid: 'u1', sso_username: 'alice', phone: ' 13800000000 ' } }),
    )
    const client = new AuthApiClient({ config, fetch: fetchImpl })
    const user = await client.getUserInfo(UNEXPIRED)
    expect(user).toEqual({ ssoUid: 'u1', username: 'alice', phone: '13800000000' })
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined
    expect(headers?.['authorization']).toBe(`Bearer ${UNEXPIRED}`)
  })

  it('rejects an incomplete profile', async () => {
    const client = new AuthApiClient({ config, fetch: vi.fn(async () => ok({ code: 0, data: { username: 'alice' } })) })
    await expect(failureOf(client.getUserInfo(UNEXPIRED))).resolves.toMatchObject({ code: 'AUTH_SERVICE_RESPONSE_INVALID' })
  })
})
