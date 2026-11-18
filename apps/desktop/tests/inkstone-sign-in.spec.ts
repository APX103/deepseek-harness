/**
 * The boot sign-in reads the loopback session endpoint from the host's
 * structured injection table; only the INKSTONE_ACCOUNT global row with a
 * usable baseUrl counts.
 */
import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class { constructor(readonly options: unknown) {} } }))
import { exchangeSignInCode, fetchSsoTarget, inkstoneSessionBaseUrl } from '../src/inkstone-sign-in.ts'

const row = (baseUrl: string): unknown => ({ kind: 'global', name: 'INKSTONE_ACCOUNT', value: { baseUrl, registerUrl: '' } })

describe('inkstoneSessionBaseUrl', () => {
  it('finds the INKSTONE_ACCOUNT global row among the boot injections', () => {
    const injections = [
      { kind: 'global', name: 'OTHER', value: { baseUrl: 'http://127.0.0.1:9' } },
      { kind: 'style', text: 'body{}' },
      row('http://127.0.0.1:45871/deadbeef'),
    ]
    expect(inkstoneSessionBaseUrl(injections)).toBe('http://127.0.0.1:45871/deadbeef')
  })

  it('returns undefined when the row is absent or unusable', () => {
    expect(inkstoneSessionBaseUrl([])).toBeUndefined()
    expect(inkstoneSessionBaseUrl([{ kind: 'global', name: 'INKSTONE_ACCOUNT', value: {} }])).toBeUndefined()
    expect(inkstoneSessionBaseUrl([{ kind: 'global', name: 'INKSTONE_ACCOUNT', value: { baseUrl: '' } }])).toBeUndefined()
    expect(inkstoneSessionBaseUrl([null, 42])).toBeUndefined()
  })
})

describe('fetchSsoTarget and exchangeSignInCode', () => {
  it('fetches the SSO target and validates the payload', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      loginUrl: 'https://sso.example/login',
      redirectUrl: 'https://discovery.example/',
    }), { status: 200 })) as unknown as typeof fetch
    try {
      await expect(fetchSsoTarget('http://127.0.0.1:1/token')).resolves.toEqual({
        loginUrl: 'https://sso.example/login',
        redirectUrl: 'https://discovery.example/',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ loginUrl: 42 }), { status: 200 })) as unknown as typeof fetch
    try {
      await expect(fetchSsoTarget('http://127.0.0.1:1/token')).resolves.toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('exchanges a code and reports the response status', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    try {
      await expect(exchangeSignInCode('http://127.0.0.1:1/token', 'uaa::code::x')).resolves.toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
    try {
      await expect(exchangeSignInCode('http://127.0.0.1:1/token', 'uaa::code::x')).resolves.toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
