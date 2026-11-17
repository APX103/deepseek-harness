/**
 * Token Plan failures: stable codes over the platform envelope.
 *
 * @module dsh-inkstone-token-plan/errors
 */

/** Stable failure codes for the Token Plan surface. */
export type TokenPlanErrorCode =
  | 'TOKEN_PLAN_NETWORK'
  | 'TOKEN_PLAN_RESPONSE_INVALID'
  | 'TOKEN_PLAN_UNAUTHORIZED'
  | 'TOKEN_PLAN_REJECTED'

/** One Token Plan failure with a stable machine code. */
export class TokenPlanError extends Error {
  constructor(
    readonly code: TokenPlanErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'TokenPlanError'
  }
}
