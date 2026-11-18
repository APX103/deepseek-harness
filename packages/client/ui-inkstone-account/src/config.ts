/**
 * Inkstone sign-in surface configuration.
 *
 * @module dsh-client-ui-inkstone-account/config
 */
import z from '@deepseek-ai/schemastery'
import type { SsoLocale } from './sso-url.ts'

export type { SsoLocale } from './sso-url.ts'

/** Inkstone sign-in surface configuration. */
export interface Config {
  /** Where the 去网页注册 link points; registration stays on the web. */
  readonly registerUrl: string
  /** Page language of the SSO sign-in window (KEP-0003). */
  readonly locale: SsoLocale
}

export const Config = z.object({
  registerUrl: z.string().default('https://discovery-staging.intern-ai.org.cn'),
  locale: z.union(['zh-CN', 'en-US']).default('zh-CN'),
})
