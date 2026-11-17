/**
 * Account-session tests: the password sign-in flow end to end over a mock
 * gateway, token caching, persistence, rejection, and sign-out.
 */
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { AccountSession } from '../src/session.ts'
import type { GrantStore, StoredGrant } from '../src/session.ts'
import type { Config } from '../src/config.ts'

const config: Config = {
  authBaseUrl: 'https://uc.example/api/user-center/v1',
  ssoOrigin: 'https://sso.example',
  clientId: 'client-1',
  source: 'discovery',
  redirectUrl: 'https://app.example/',
  requestTimeoutMs: 5_000,
}

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const JWT = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(
  JSON.stringify({ exp: Math.floor((Date.now() + 3_600_000) / 1000) }),
).toString('base64url')}.${Buffer.from('sig').toString('base64url')}`

class MemoryStore implements GrantStore {
  written: StoredGrant[] = []
  cleared = 0
  async read(): Promise<StoredGrant | undefined> {
    return this.written.at(-1)
  }
  async write(grant: StoredGrant): Promise<void> {
    this.written.push(grant)
  }
  async clear(): Promise<void> {
    this.cleared += 1
    this.written = []
  }
}

type Route = (input: string, init?: RequestInit) => Promise<Response>

function gatewayRoute(profileFails = false): Route {
  return async (input) => {
    if (input.endsWith('/cipher/getPubKey')) return json({ msgCode: '10000', data: { publicKey: PUBLIC_PEM } })
    if (input.endsWith('/login/byAccount')) return json({ msgCode: '10000', data: { code: 'uaa::code::g1' } })
    if (input.endsWith('/users/auth')) return json({ code: 0, data: { token: JWT } })
    if (input.endsWith('/users/getUserInfo')) {
      if (profileFails) return new Response('boom', { status: 500 })
      return json({ code: 0, data: { ssoUid: 'u1', username: 'alice', phone: '138' } })
    }
    if (input.endsWith('/users/logout')) return json({ code: 0, data: {} })
    throw new Error(`unexpected ${input}`)
  }
}

function json(envelope: unknown): Response {
  return new Response(JSON.stringify(envelope), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('inkstone account session', () => {
  it('signs in with password, caches the token, and persists the grant', async () => {
    const store = new MemoryStore()
    const session = new AccountSession({ config, fetch: gatewayRoute(), store })
    const view = await session.signInWithPassword('alice', 'pw')
    expect(view.user).toEqual({ ssoUid: 'u1', username: 'alice', phone: '138' })
    expect(session.state()).toMatchObject({ authenticated: true })
    await expect(session.resolveToken()).resolves.toBe(JWT)
    expect(store.written.at(-1)).toMatchObject({ version: 1, token: JWT })
  })

  it('signs in even when the profile read fails', async () => {
    const session = new AccountSession({ config, fetch: gatewayRoute(true) })
    const view = await session.signInWithPassword('alice', 'pw')
    expect(view.user).toBeUndefined()
    await expect(session.resolveToken()).resolves.toBe(JWT)
  })

  it('restores an unexpired stored grant without network activity', async () => {
    const store = new MemoryStore()
    store.written.push({ version: 1, token: JWT, user: { ssoUid: 'u1', username: 'alice' } })
    const fetchImpl = vi.fn()
    const session = new AccountSession({ config, fetch: fetchImpl, store })
    await session.restore()
    expect(session.state()).toMatchObject({ authenticated: true, user: { username: 'alice' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects exactly the rejected token and signs out best-effort', async () => {
    const store = new MemoryStore()
    const session = new AccountSession({ config, fetch: gatewayRoute(), store })
    await session.signInWithPassword('alice', 'pw')
    await session.rejectToken('not-the-token')
    expect(session.state().authenticated).toBe(true)
    await session.rejectToken(JWT)
    expect(session.state().authenticated).toBe(false)
    expect(store.cleared).toBe(1)
    await session.signInWithPassword('alice', 'pw')
    await session.signOut()
    expect(session.state().authenticated).toBe(false)
    await expect(session.resolveToken()).resolves.toBeUndefined()
  })
})
