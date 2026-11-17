/**
 * Host-half tests: the loopback session endpoint serves state, sign-in, and
 * sign-out over a fake account service, and the index-injection global
 * carries the unguessable base URL.
 */
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import { INKSTONE_ACCOUNT_GLOBAL } from '../src/global.ts'

interface FakeAccount {
  state: () => { authenticated: boolean; user?: { username: string }; expiresAtMs?: number }
  signInWithPassword: (username: string, password: string) => Promise<{ user?: { username: string }; expiresAtMs: number }>
  signOut: () => Promise<void>
}

function fakeContext(account: FakeAccount) {
  const listeners: { event: string; handler: (...args: unknown[]) => unknown }[] = []
  const cleanups: (() => void)[] = []
  const ctx = {
    inkstoneAccount: account,
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      listeners.push({ event, handler })
    },
    effect: (register: () => () => void) => {
      cleanups.push(register())
      return () => undefined
    },
  }
  return { ctx, listeners, cleanups }
}

interface InjectionRow {
  kind: string
  name: string
  value: { baseUrl: string; registerUrl: string }
}

async function boot(account: FakeAccount) {
  const { ctx, listeners, cleanups } = fakeContext(account)
  apply(ctx as never, { registerUrl: 'https://discovery.example' })
  // The loopback server binds asynchronously; give it a beat before the
  // first index-inject emit.
  await new Promise((resolve) => {
    setTimeout(resolve, 150)
  })
  const inject = listeners.find(listener => listener.event === 'webserver/index-inject')
  if (inject === undefined) throw new Error('no index-inject listener')
  const table: InjectionRow[] = []
  ;(inject.handler as (rows: InjectionRow[]) => void)(table)
  const global = table[0]
  if (global === undefined || global.name !== INKSTONE_ACCOUNT_GLOBAL) throw new Error('no injection row')
  return {
    baseUrl: global.value.baseUrl,
    registerUrl: global.value.registerUrl,
    close: () => {
      for (const cleanup of cleanups) cleanup()
    },
  }
}

describe('inkstone session endpoint', () => {
  it('serves the signed-out state', async () => {
    const state = vi.fn(() => ({ authenticated: false }))
    const endpoint = await boot({
      state,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    })
    try {
      const response = await fetch(`${endpoint.baseUrl}/session`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ authenticated: false, user: undefined, expiresAtMs: undefined })
    } finally {
      endpoint.close()
    }
  })

  it('signs in and reports the account view', async () => {
    const signIn = vi.fn(async () => ({ user: { username: 'alice' }, expiresAtMs: 1_900_000_000_000 }))
    const endpoint = await boot({
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: signIn,
      signOut: vi.fn(),
    })
    try {
      const response = await fetch(`${endpoint.baseUrl}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'pw' }),
      })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ authenticated: true, user: { username: 'alice' } })
      expect(signIn).toHaveBeenCalledWith('alice', 'pw')
    } finally {
      endpoint.close()
    }
  })

  it('maps account failures and rejects foreign paths', async () => {
    const endpoint = await boot({
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: vi.fn(async () => {
        throw Object.assign(new Error('账号或密码错误'), { code: 'AUTH_REJECTED' })
      }),
      signOut: vi.fn(),
    })
    try {
      const rejected = await fetch(`${endpoint.baseUrl}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'bad' }),
      })
      expect(rejected.status).toBe(401)
      await expect(rejected.json()).resolves.toMatchObject({ code: 'AUTH_REJECTED' })
      const foreign = await fetch(`${endpoint.baseUrl.replace(/\/[^/]+$/, '/wrong-token')}/session`)
      expect(foreign.status).toBe(404)
    } finally {
      endpoint.close()
    }
  })
})
