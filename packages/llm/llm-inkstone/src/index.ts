/**
 * The Inkstone LLM route plugin: registers the orbit-gateway adapter on the
 * `llm` service and its configurable-provider directory entry (KEP-0002 M1).
 *
 * M1 authentication reads a bearer JWT from the environment (`INKSTONE_JWT`);
 * M2 replaces `resolveToken` with the inkstone-account credential service and
 * M3 adds the Token Plan balance surface.
 *
 * @module dsh-llm-inkstone
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { InkstoneAdapter } from './adapter.ts'
import { Config } from './config.ts'

export { InkstoneAdapter } from './adapter.ts'
export type { InkstoneAdapterDeps } from './adapter.ts'
export { Config } from './config.ts'
export type { Config as InkstoneConfig, InkstoneModelEntry } from './config.ts'
export {
  TOKEN_PLAN_FAILURE_CODES,
  tokenPlanFailureCode,
} from './failure.ts'
export type { TokenPlanFailureCode } from './failure.ts'

export const name = 'llm-inkstone'
export const inject = ['llm']

const PROVIDER = 'inkstone'

export function apply(ctx: Context, config: Config): void {
  const settings = (): Config => ({ ...config })
  const adapter = new InkstoneAdapter({
    settings,
    resolveToken: () => {
      const raw = process.env[settings().tokenEnv]
      const trimmed = raw?.trim()
      return trimmed === undefined || trimmed === '' ? undefined : trimmed
    },
  })
  ctx.llm.registerAdapter([PROVIDER], adapter)
  ctx.llm.registerConfigurableProviders([
    {
      provider: PROVIDER,
      displayName: 'Inkstone · 端砚',
      settingsNs: ctx.fiber.entry?.options.id ?? name,
      settingsPath: [],
    },
  ])
}
