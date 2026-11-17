/**
 * The Inkstone (端砚) account plugin: unit SSO sign-in, the sanitized
 * profile, and bearer-JWT resolution for the harness (KEP-0002 M2).
 *
 * Sign-in is username/password over the OpenXLab uaa `byAccount` flow (the
 * same one the SSO web form uses); registration stays on the web. A browser
 * `uaa::code::` completion joins in M3. The default export is the Cordis
 * service class, so a bundle row loads this package directly.
 *
 * @module dsh-inkstone-account
 */
import { InkstoneAccount } from './service.ts'

export { Config } from './config.ts'
export type { Config as InkstoneAccountConfig } from './config.ts'
export { InkstoneAccountError } from './errors.ts'
export type { InkstoneAccountErrorCode } from './errors.ts'
export { jwtExpiresAtMs, requireUnexpiredJwt } from './jwt.ts'
export { readJwtFromAuthResponse, sanitizeAuthUser } from './protocol.ts'
export type { InkstoneUser } from './protocol.ts'
export { AuthApiClient } from './api-client.ts'
export type { AuthFetch } from './api-client.ts'
export { UaaPasswordClient, encryptCredential } from './password-login.ts'
export { AccountSession } from './session.ts'
export type {
  AccountSessionDeps,
  GrantStore,
  InkstoneAccountState,
  InkstoneAccountView,
  StoredGrant,
} from './session.ts'
export { InkstoneAccount } from './service.ts'

export default InkstoneAccount
