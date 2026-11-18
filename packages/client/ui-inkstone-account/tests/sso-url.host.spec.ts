/**
 * The ported SSO URL helpers: the login page URL carries the registered
 * redirect unescaped, and the callback check accepts exactly the registered
 * redirect carrying one `uaa::code::` code (KEP-0003, intern-inkstone semantics).
 */
import { describe, expect, it } from 'vitest'
import { buildSsoLoginUrl, readSsoCallbackCode } from '../src/sso-url.ts'

const deployment = {
  ssoOrigin: 'https://sso.example',
  clientId: 'client-id-01',
  source: 'discovery',
  redirectUrl: 'https://discovery.example/',
}

describe('buildSsoLoginUrl', () => {
  it('builds the authentication page URL with the unescaped nested redirect', () => {
    expect(buildSsoLoginUrl(deployment, 'zh-CN')).toBe(
      'https://sso.example/authentication'
      + '?redirect=https://discovery.example/?scenario=desktop'
      + '&clientId=client-id-01&source=discovery&lang=zh-CN',
    )
  })

  it('rejects a redirect that is not a plain https URL', () => {
    expect(() => buildSsoLoginUrl({ ...deployment, redirectUrl: 'http://discovery.example/' }, 'zh-CN')).toThrow()
    expect(() => buildSsoLoginUrl({ ...deployment, redirectUrl: 'https://discovery.example/?a=b' }, 'zh-CN')).toThrow()
    expect(() => buildSsoLoginUrl({ ...deployment, redirectUrl: 'https://discovery.example/%3Fx' }, 'zh-CN')).toThrow()
    expect(() => buildSsoLoginUrl({ ...deployment, redirectUrl: 'not a url' }, 'zh-CN')).toThrow()
  })
})

describe('readSsoCallbackCode', () => {
  it('accepts the registered redirect with exactly one uaa code', () => {
    const value = 'https://discovery.example/?code=uaa%3A%3Acode%3A%3Aabc123'
    expect(readSsoCallbackCode(value, deployment)).toBe('uaa::code::abc123')
  })

  it('rejects everything that is not the registered redirect', () => {
    const code = 'https://discovery.example/?code=uaa%3A%3Acode%3A%3Aabc123'
    expect(readSsoCallbackCode('https://other.example/?code=uaa%3A%3Acode%3A%3Aabc123', deployment)).toBeNull()
    expect(readSsoCallbackCode('https://discovery.example/callback?code=uaa%3A%3Acode%3A%3Aabc123', deployment)).toBeNull()
    expect(readSsoCallbackCode('https://user:pw@discovery.example/?code=uaa%3A%3Acode%3A%3Aabc123', deployment)).toBeNull()
    expect(readSsoCallbackCode('https://discovery.example/?code=uaa%3A%3Acode%3A%3Aabc123#fragment', deployment)).toBeNull()
    expect(readSsoCallbackCode('https://discovery.example/', deployment)).toBeNull()
    expect(readSsoCallbackCode(`${code}&code=uaa%3A%3Acode%3A%3Asecond`, deployment)).toBeNull()
    expect(readSsoCallbackCode('https://discovery.example/?code=plain', deployment)).toBeNull()
    expect(readSsoCallbackCode(`https://discovery.example/?code=uaa%3A%3Acode%3A%3A${'x'.repeat(2048)}`, deployment)).toBeNull()
    expect(readSsoCallbackCode('not a url', deployment)).toBeNull()
  })

  it('accepts a code of exactly the 2048-code-unit ceiling', () => {
    const code = `uaa::code::${'x'.repeat(2037)}`
    const value = `https://discovery.example/?code=${encodeURIComponent(code)}`
    expect(readSsoCallbackCode(value, deployment)).toBe(code)
  })
})
