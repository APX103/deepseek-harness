/**
 * JWT expiry reading, ported from intern-inkstone
 * `src/main/features/auth/token.ts`. The payload is only a local expiry hint;
 * signature, issuer, and audience validation stay with the Discovery service.
 *
 * @module dsh-inkstone-account/jwt
 */
import { InkstoneAccountError } from './errors.ts'

const MAX_JWT_LENGTH = 16_384
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/

/** Read the `exp` claim of one JWT as epoch milliseconds. */
export function jwtExpiresAtMs(token: string): number {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_JWT_LENGTH ||
    token !== token.trim()
  ) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid')
  }
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some(segment => !BASE64URL_SEGMENT.test(segment))) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid')
  }
  const payloadSegment = segments[1]
  if (payloadSegment === undefined) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid')
  }
  let claims: unknown
  try {
    const payload = Buffer.from(payloadSegment, 'base64url')
    if (payload.length === 0 || payload.toString('base64url') !== payloadSegment) {
      throw new Error('JWT payload is not canonical base64url')
    }
    claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)) as unknown
  } catch (cause) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid', { cause })
  }
  if (
    claims === null ||
    typeof claims !== 'object' ||
    !Number.isSafeInteger((claims as Record<string, unknown>)['exp']) ||
    ((claims as Record<string, unknown>)['exp'] as number) <= 0
  ) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid')
  }
  const expiresAtMs = ((claims as Record<string, unknown>)['exp'] as number) * 1000
  if (!Number.isSafeInteger(expiresAtMs)) {
    throw new InkstoneAccountError('AUTH_TOKEN_INVALID', 'Authentication token is invalid')
  }
  return expiresAtMs
}

/** Assert one JWT is unexpired at `nowMs`; returns its expiry. */
export function requireUnexpiredJwt(token: string, nowMs = Date.now()): number {
  const expiresAtMs = jwtExpiresAtMs(token)
  if (!Number.isFinite(nowMs) || nowMs >= expiresAtMs) {
    throw new InkstoneAccountError('AUTH_EXPIRED', 'Authentication token has expired')
  }
  return expiresAtMs
}
