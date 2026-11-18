/**
 * Inkstone account configuration: the unit's user-center API, the OpenXLab
 * SSO gateway, and the registered OAuth client facts.
 *
 * Defaults are the staging deployment (intern-inkstone `env/.env.staging`):
 * client `05wrodmwk4z3mze13kmy`, source `discovery`, redirect to the staging
 * discovery origin. A production profile overrides all four plus the two
 * origins.
 *
 * @module dsh-inkstone-account/config
 */
import z from '@deepseek-ai/schemastery'

/** Inkstone account configuration. */
export interface Config {
  /** User-center API root; `POST {authBaseUrl}/users/auth` exchanges an SSO code for the JWT. */
  readonly authBaseUrl: string
  /** OpenXLab SSO origin serving `/authentication` and the uaa-be gateway. */
  readonly ssoOrigin: string
  /** Registered SSO OAuth client id. */
  readonly clientId: string
  /** Client source identifier reported to SSO. */
  readonly source: string
  /** Registered redirect URL (used by browser-based sign-in; kept for M3). */
  readonly redirectUrl: string
  /** Deadline for each authentication HTTP request. */
  readonly requestTimeoutMs: number
}

/** The SSO OAuth facts the page sign-in URL and callback check read (KEP-0003). */
export interface InkstoneSsoDeployment {
  /** OpenXLab SSO origin serving `/authentication`. */
  readonly ssoOrigin: string
  /** Registered SSO OAuth client id. */
  readonly clientId: string
  /** Client source identifier reported to SSO. */
  readonly source: string
  /** Registered redirect URL the SSO gateway sends the `uaa::code::` callback to. */
  readonly redirectUrl: string
}

export const Config = z.object({
  authBaseUrl: z
    .string()
    .default('https://discovery-staging.intern-ai.org.cn/api/user-center/v1'),
  ssoOrigin: z.string().default('https://sso.staging.openxlab.org.cn'),
  clientId: z.string().default('05wrodmwk4z3mze13kmy'),
  source: z.string().default('discovery'),
  redirectUrl: z.string().default('https://discovery-staging.intern-ai.org.cn/'),
  requestTimeoutMs: z.number().default(20_000),
})
