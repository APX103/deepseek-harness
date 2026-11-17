/**
 * uaa password-login tests over a mock gateway with a real RSA keypair: the
 * public-key fetch, the encrypted password round-trip, and envelope failures.
 */
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { UaaPasswordClient, decryptPasswordForTests } from '../src/password-login.ts'
import type { Config } from '../src/config.ts'
import type { InkstoneAccountError } from '../src/errors.ts'

const config: Config = {
  authBaseUrl: 'https://uc.example/api/user-center/v1',
  ssoOrigin: 'https://sso.example',
  clientId: 'client-1',
  source: 'discovery',
  redirectUrl: 'https://app.example/',
  requestTimeoutMs: 5_000,
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

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

describe('inkstone uaa password login', () => {
  it('encrypts the password and resolves the uaa code', async () => {
    const captured: Record<string, unknown>[] = []
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body ?? '{}') as string) as Record<string, unknown>
      if (input.endsWith('/cipher/getPubKey')) return ok({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } })
      if (input.endsWith('/login/byAccount')) {
        captured.push(body)
        return ok({ msgCode: '10000', data: { code: 'uaa::code::grant-1' } })
      }
      throw new Error(`unexpected ${input}`)
    })
    const client = new UaaPasswordClient({ config, fetch: fetchImpl })
    const code = await client.signInWithPassword('alice', 's3cret-pass')
    expect(code).toBe('uaa::code::grant-1')
    const sent = captured[0]?.['data'] as Record<string, unknown>
    expect(sent['username']).toBe('alice')
    expect(sent['clientId']).toBe('client-1')
    expect(typeof sent['password']).toBe('string')
    expect(sent['password']).not.toContain('s3cret')
    expect(decryptPasswordForTests(privateKey, String(sent['password']))).toBe('s3cret-pass')
  })

  it('maps envelope rejections and transport failures', async () => {
    const keyOnly = vi.fn(async (input: string) =>
      input.endsWith('/cipher/getPubKey') ? ok({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } }) : new Response('{}', { status: 200 }),
    )
    await expect(
      failureOf(
        new UaaPasswordClient({
          config,
          fetch: vi.fn(async (input: string) =>
            input.endsWith('/cipher/getPubKey')
              ? ok({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } })
              : ok({ msgCode: '10001', msg: 'wrong credentials' }),
          ),
        }).signInWithPassword('alice', 'nope'),
      ),
    ).resolves.toMatchObject({ code: 'AUTH_REJECTED' })
    await expect(
      failureOf(
        new UaaPasswordClient({
          config,
          fetch: vi.fn(async (input: string) =>
            input.endsWith('/cipher/getPubKey')
              ? ok({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } })
              : ok({ msgCode: '10000', data: { token: 'no-code-here' } }),
          ),
        }).signInWithPassword('alice', 'pw'),
      ),
    ).resolves.toMatchObject({ code: 'AUTH_SERVICE_RESPONSE_INVALID' })
    await expect(
      failureOf(
        new UaaPasswordClient({ config, fetch: vi.fn(async () => { throw new Error('offline') }) }).signInWithPassword('alice', 'pw'),
      ),
    ).resolves.toMatchObject({ code: 'AUTH_NETWORK' })
    await expect(
      failureOf(new UaaPasswordClient({ config, fetch: keyOnly }).signInWithPassword('alice', 'pw')),
    ).resolves.toMatchObject({ code: 'AUTH_SERVICE_RESPONSE_INVALID' })
  })

  it('treats 401/403 as a captcha challenge', async () => {
    const client = new UaaPasswordClient({
      config,
      fetch: vi.fn(async (input: string) =>
        input.endsWith('/cipher/getPubKey')
          ? ok({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } })
          : new Response('{}', { status: 403 }),
      ),
    })
    await expect(failureOf(client.signInWithPassword('alice', 'pw'))).resolves.toMatchObject({ code: 'AUTH_CAPTCHA_REQUIRED' })
  })
})
