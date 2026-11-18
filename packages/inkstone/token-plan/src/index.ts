/**
 * The Inkstone (端砚) Token Plan plugin: 墨点 balance, free-grant, and
 * credit-increase operations over the platform API, authenticated by the
 * inkstone account service (KEP-0002 M3). The default export is the Cordis
 * service class, so a bundle row loads this package directly and the class
 * constructor resolves its identity from `ctx.inkstoneAccount` (tests and
 * embeddings inject their own sources through `InkstoneTokenPlanDeps`).
 *
 * @module dsh-inkstone-token-plan
 */
import { InkstoneTokenPlan } from './service.ts'

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
  TokenPlanPackage,
  TokenPlanTransaction,
  TokenPlanTransactionPage,
} from './client.ts'
export { formatInkstoneCredits } from './format.ts'
export { InkstoneTokenPlan } from './service.ts'
export type { InkstoneTokenPlanDeps, TokenPlanIdentitySource, TokenPlanTokenSource } from './service.ts'

export default InkstoneTokenPlan
