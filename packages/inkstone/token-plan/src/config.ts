/**
 * Token Plan configuration: the platform API root serving `/tokenplan/v1`.
 *
 * @module dsh-inkstone-token-plan/config
 */
import z from '@deepseek-ai/schemastery'

/** Token Plan configuration. */
export interface Config {
  /** Platform API root (`MAIN_VITE_API_BASE_URL` in the desktop; not the orbit root). */
  readonly apiBaseUrl: string
  /** Deadline for each Token Plan HTTP request. */
  readonly requestTimeoutMs: number
}

export const Config = z.object({
  apiBaseUrl: z.string().default('https://discovery-staging.intern-ai.org.cn/api'),
  requestTimeoutMs: z.number().default(15_000),
})
