/**
 * Inkstone account failures: stable codes over the ported desktop semantics.
 *
 * @module dsh-inkstone-account/errors
 */

/** Stable failure codes for the account surface. */
export type InkstoneAccountErrorCode =
  | 'AUTH_SERVICE_RESPONSE_INVALID'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_EXPIRED'
  | 'AUTH_REJECTED'
  | 'AUTH_NETWORK'
  | 'AUTH_CAPTCHA_REQUIRED'

/** One account failure with a stable machine code. */
export class InkstoneAccountError extends Error {
  constructor(
    readonly code: InkstoneAccountErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'InkstoneAccountError'
  }
}
