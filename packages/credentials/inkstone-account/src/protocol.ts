/**
 * User-center response parsing, ported from intern-inkstone
 * `src/main/features/auth/protocol.ts`: the `{code, data}` envelope, JWT
 * extraction with expiry, and the sanitized account projection.
 *
 * @module dsh-inkstone-account/protocol
 */
import { InkstoneAccountError } from './errors.ts'
import { requireUnexpiredJwt } from './jwt.ts'

/** The sanitized account projection the harness keeps beside the token. */
export interface InkstoneUser {
  readonly ssoUid: string
  readonly username: string
  readonly nickname?: string
  readonly email?: string
  readonly phone?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Unwrap one `{code, data}` envelope; codes other than 0/200 are failures. */
export function unwrapAuthResponse(value: unknown): unknown {
  if (!isRecord(value)) {
    throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'Authentication response must be an object')
  }
  const code = value['code']
  if (typeof code === 'number' && code !== 0 && code !== 200) {
    throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', `Authentication service returned code ${code}`)
  }
  return value['data'] ?? value
}

/** Read the bearer JWT out of one `/users/auth` response, rejecting expired tokens. */
export function readJwtFromAuthResponse(value: unknown, nowMs = Date.now()): string {
  const data = unwrapAuthResponse(value)
  if (
    !isRecord(data) ||
    typeof data['token'] !== 'string' ||
    data['token'].trim() === '' ||
    data['token'].length > 16_384
  ) {
    throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'Authentication response did not contain a token')
  }
  const token = data['token'].trim()
  requireUnexpiredJwt(token, nowMs)
  return token
}

/** Sanitize one `/users/getUserInfo` response into the account projection. */
export function sanitizeAuthUser(value: unknown): InkstoneUser {
  const data = unwrapAuthResponse(value)
  if (!isRecord(data)) {
    throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'Authentication user profile must be an object')
  }
  const ssoUid = boundedString(data['ssoUid'], 160) || boundedString(data['sso_uid'], 160)
  const username =
    boundedString(data['username'], 160) ||
    boundedString(data['ssoUsername'], 160) ||
    boundedString(data['sso_username'], 160) ||
    boundedString(data['nickname'], 160)
  if (ssoUid === '' || username === '') {
    throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'Authentication user profile is incomplete')
  }
  const nickname = boundedString(data['nickname'], 160)
  const email = boundedString(data['email'], 320) || boundedString(data['sso_email'], 320)
  const phone = boundedString(data['phone'], 32) || boundedString(data['sso_phone'], 32)
  return {
    ssoUid,
    username,
    ...(nickname !== '' ? { nickname } : {}),
    ...(email !== '' ? { email } : {}),
    ...(phone !== '' ? { phone } : {}),
  }
}
