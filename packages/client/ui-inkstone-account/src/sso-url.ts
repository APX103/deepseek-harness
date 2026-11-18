/**
 * SSO page sign-in URL construction and callback recognition, ported from
 * intern-inkstone `src/main/features/auth/deployment.ts` (KEP-0003). The SSO
 * `/authentication` page owns every human-verification flow itself; this
 * module only builds the entry URL and recognizes the registered redirect.
 *
 * @module dsh-client-ui-inkstone-account/sso-url
 */

/** The SSO OAuth facts the login URL and callback check both need. */
export interface SsoDeployment {
  /** OpenXLab SSO origin serving `/authentication`. */
  readonly ssoOrigin: string
  /** Registered SSO OAuth client id. */
  readonly clientId: string
  /** Client source identifier reported to SSO. */
  readonly source: string
  /** Registered redirect URL the SSO gateway sends the `uaa::code::` callback to. */
  readonly redirectUrl: string
}

/** Page language the SSO `/authentication` page accepts. */
export type SsoLocale = 'zh-CN' | 'en-US'

/** Build the SSO login page URL: phone-number form first, verification inside the page. */
export function buildSsoLoginUrl(deployment: SsoDeployment, locale: SsoLocale): string {
  const url = new URL('/authentication', deployment.ssoOrigin)
  const parameters = new URLSearchParams()

  parameters.set('clientId', deployment.clientId)
  parameters.set('source', deployment.source)
  parameters.set('lang', locale)

  const redirectUrl = new URL(validateRawRedirect(deployment.redirectUrl))
  redirectUrl.searchParams.set('scenario', 'desktop')
  // Discovery SSO reads `redirect` from the raw query string instead of
  // URLSearchParams. Keep only this validated, Main-derived nested URL
  // unescaped; every remaining field is serialized by URLSearchParams.
  url.search = `?redirect=${redirectUrl.toString()}&${parameters.toString()}`
  return url.toString()
}

/**
 * Recognize the SSO callback URL and extract the authorization code. Only the
 * registered redirect URL participates, so a caller that captured the callback
 * needs just that field.
 * @returns the `uaa::code::…` code, or `null` when `value` is not the registered redirect with exactly one code.
 */
export function readSsoCallbackCode(value: string, deployment: Pick<SsoDeployment, 'redirectUrl'>): string | null {
  let candidate: URL
  try {
    candidate = new URL(value)
  } catch {
    return null
  }

  const expected = new URL(deployment.redirectUrl)
  if (
    candidate.username ||
    candidate.password ||
    candidate.hash ||
    candidate.origin !== expected.origin ||
    candidate.pathname !== expected.pathname
  ) {
    return null
  }

  const codes = candidate.searchParams.getAll('code')
  if (codes.length !== 1) return null
  const [code = ''] = codes
  return code.startsWith('uaa::code::') && code.length <= 2048 ? code : null
}

function validateRawRedirect(value: string): string {
  let redirectUrl: URL
  try {
    redirectUrl = new URL(value)
  } catch {
    throw new Error('inkstone-account redirectUrl is not a valid URL')
  }
  if (
    redirectUrl.protocol !== 'https:' ||
    redirectUrl.href !== value ||
    redirectUrl.search !== '' ||
    redirectUrl.href.includes('&') ||
    /%(?:23|26|3f)/i.test(redirectUrl.href)
  ) {
    throw new Error('inkstone-account redirectUrl is invalid')
  }
  return redirectUrl.href
}
