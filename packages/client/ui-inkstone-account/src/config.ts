/**
 * Inkstone sign-in surface configuration.
 *
 * @module dsh-client-ui-inkstone-account/config
 */
import z from '@deepseek-ai/schemastery'

/** Inkstone sign-in surface configuration. */
export interface Config {
  /** Where the 去网页注册 link points; registration stays on the web. */
  readonly registerUrl: string
}

export const Config = z.object({
  registerUrl: z.string().default('https://discovery-staging.intern-ai.org.cn'),
})
