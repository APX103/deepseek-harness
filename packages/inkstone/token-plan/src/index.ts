/**
 * The Inkstone (端砚) Token Plan plugin: 墨点 balance, free-grant, and
 * credit-increase operations over the platform API, authenticated by the
 * inkstone account service (KEP-0002 M3). The default export is the Cordis
 * service class, so a bundle row loads this package directly.
 *
 * @module dsh-inkstone-token-plan
 */
import { Context } from '@deepseek-ai/cordis'
import { InkstoneTokenPlan } from './service.ts'
import { Config } from './config.ts'

export { Config } from './config.ts'
export type { Config as InkstoneTokenPlanConfig } from './config.ts'
export { TokenPlanError } from './errors.ts'
export type { TokenPlanErrorCode } from './errors.ts'
export { TokenPlanClient } from './client.ts'
export type {
  CreditIncreaseApplication,
  CreditIncreaseScenario,
  FreeGrantOutcome,
  TokenPlanBalance,
  TokenPlanClientDeps,
  TokenPlanFetch,
} from './client.ts'
export { formatInkstoneCredits } from './format.ts'
export { InkstoneTokenPlan } from './service.ts'
export type { InkstoneTokenPlanDeps } from './service.ts'

export const name = 'inkstone-token-plan'

export function apply(ctx: Context, config: Config): void {
  const account = () =>
    ctx.get('inkstoneAccount') as
      | { resolveToken?: () => Promise<string | undefined>; state?: () => { user?: { ssoUid?: string } } }
      | undefined
  ctx.set(
    'inkstoneTokenPlan',
    new InkstoneTokenPlan(ctx, config, {
      resolveToken: async () => {
        const fromService = await account()?.resolveToken?.()
        if (fromService !== undefined && fromService !== '') return fromService
        const raw = process.env['INKSTONE_JWT']?.trim()
        return raw === undefined || raw === '' ? undefined : raw
      },
      resolveSsoUid: () => account()?.state?.().user?.ssoUid,
    }),
  )
}

export default InkstoneTokenPlan
