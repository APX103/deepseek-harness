/**
 * Host-half tests: the loopback session endpoint serves state, sign-in, and
 * sign-out over a fake account service, and the index-injection global
 * carries the unguessable base URL.
 */
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import { INKSTONE_ACCOUNT_GLOBAL } from '../src/global.ts'

interface FakeAccount {
  deployment: () => { ssoOrigin: string; clientId: string; source: string; redirectUrl: string }
  state: () => { authenticated: boolean; user?: { username: string }; expiresAtMs?: number }
  signInWithPassword: (username: string, password: string) => Promise<{ user?: { username: string }; expiresAtMs: number }>
  signInWithCode: (code: string) => Promise<{ user?: { username: string }; expiresAtMs: number }>
  signOut: () => Promise<void>
}

const deployment = {
  ssoOrigin: 'https://sso.example',
  clientId: 'client-id-01',
  source: 'discovery',
  redirectUrl: 'https://discovery.example/',
}

function fakeContext(account: FakeAccount) {
  const listeners: { event: string; handler: (...args: unknown[]) => unknown }[] = []
  const cleanups: (() => void)[] = []
  const ctx = {
    inkstoneAccount: account,
    get: (name: string) => (name === 'inkstoneTokenPlan' ? tokenPlan : undefined),
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

let tokenPlan: { balance: () => Promise<{ credits: number }> } | undefined

interface InjectionRow {
  kind: string
  name: string
  value: { baseUrl: string; registerUrl: string }
}

async function boot(account: FakeAccount) {
  const { ctx, listeners, cleanups } = fakeContext(account)
  apply(ctx as never, { registerUrl: 'https://discovery.example', locale: 'zh-CN' })
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
      deployment: () => deployment,
      state,
      signInWithPassword: vi.fn(),
      signInWithCode: vi.fn(),
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
      deployment: () => deployment,
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: signIn,
      signInWithCode: vi.fn(),
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
      deployment: () => deployment,
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: vi.fn(async () => {
        throw Object.assign(new Error('账号或密码错误'), { code: 'AUTH_REJECTED' })
      }),
      signInWithCode: vi.fn(),
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

  it('serves the SSO login page URL built from the account deployment', async () => {
    const endpoint = await boot({
      deployment: () => deployment,
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: vi.fn(),
      signInWithCode: vi.fn(),
      signOut: vi.fn(),
    })
    try {
      const response = await fetch(`${endpoint.baseUrl}/session/sso`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        loginUrl:
          'https://sso.example/authentication'
          + '?redirect=https://discovery.example/?scenario=desktop'
          + '&clientId=client-id-01&source=discovery&lang=zh-CN',
        redirectUrl: deployment.redirectUrl,
      })
      const wrongMethod = await fetch(`${endpoint.baseUrl}/session/sso`, { method: 'POST' })
      expect(wrongMethod.status).toBe(405)
    } finally {
      endpoint.close()
    }
  })

  it('exchanges a callback code for the account view', async () => {
    const signInWithCode = vi.fn(async () => ({ user: { username: 'alice' }, expiresAtMs: 1_900_000_000_000 }))
    const endpoint = await boot({
      deployment: () => deployment,
      state: vi.fn(() => ({ authenticated: false })),
      signInWithPassword: vi.fn(),
      signInWithCode,
      signOut: vi.fn(),
    })
    try {
      const response = await fetch(`${endpoint.baseUrl}/session/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'uaa::code::abc123' }),
      })
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ authenticated: true, user: { username: 'alice' } })
      expect(signInWithCode).toHaveBeenCalledWith('uaa::code::abc123')
      const missing = await fetch(`${endpoint.baseUrl}/session/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(missing.status).toBe(400)
      const wrongMethod = await fetch(`${endpoint.baseUrl}/session/code`)
      expect(wrongMethod.status).toBe(405)
    } finally {
      endpoint.close()
    }
  })

  it('serves the Token Plan balance when the service is present and 404 otherwise', async () => {
    tokenPlan = { balance: vi.fn(async () => ({ credits: 1234.5 })) }
    try {
      const endpoint = await boot({
        deployment: () => deployment,
        state: vi.fn(() => ({ authenticated: true })),
        signInWithPassword: vi.fn(),
        signInWithCode: vi.fn(),
        signOut: vi.fn(),
      })
      try {
        const response = await fetch(`${endpoint.baseUrl}/session/balance`)
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ credits: 1234.5 })
      } finally {
        endpoint.close()
      }
    } finally {
      tokenPlan = undefined
    }
    const without = await boot({
      deployment: () => deployment,
      state: vi.fn(() => ({ authenticated: true })),
      signInWithPassword: vi.fn(),
      signInWithCode: vi.fn(),
      signOut: vi.fn(),
    })
    try {
      const response = await fetch(`${without.baseUrl}/session/balance`)
      expect(response.status).toBe(404)
    } finally {
      without.close()
    }
  })
})
