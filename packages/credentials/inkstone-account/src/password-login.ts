/**
 * OpenXLab uaa password sign-in: the `/gw/uaa-be/api/v1/login/byAccount`
 * flow the SSO web form itself uses — fetch the RSA public key, encrypt the
 * password, post `{data: {...}}`, and read back the `uaa::code::` grant.
 *
 * Wire facts verified against the staging SSO bundle (2026-11-17): the
 * endpoint family, the `{msgCode: '10000', msg, data}` envelope, the
 * `captchaid` response header, and server-side password decryption (error
 * table `A0216 user password decrypt failed`). The exact payload field names
 * are marked `verify-wire` and need one live sign-in to confirm.
 *
 * @module dsh-inkstone-account/password-login
 */
import { constants, createPublicKey, privateDecrypt, publicEncrypt, type KeyObject } from 'node:crypto'
import type { Config } from './config.ts'
import { InkstoneAccountError } from './errors.ts'

const UAA_BASE = '/gw/uaa-be/api/v1'
const CODE_PREFIX = 'uaa::code::'

export type UaaFetch = (input: string, init: RequestInit) => Promise<Response>

/** One uaa gateway boundary; injectable for tests. */
export interface UaaPasswordClientDeps {
  readonly config: Config
  readonly fetch: UaaFetch
  /** Clock for the credential timestamp; injectable for tests. */
  readonly now?: () => number
}

/** Wrap one public key value as a KeyObject, accepting PEM or base64 DER. */
export function loadPublicKey(value: string): KeyObject {
  const trimmed = value.trim()
  if (trimmed.includes('BEGIN')) return createPublicKey(trimmed)
  const der = Buffer.from(trimmed, 'base64')
  try {
    return createPublicKey({ key: der, format: 'der', type: 'spki' })
  } catch {
    return createPublicKey({ key: der, format: 'der', type: 'pkcs1' })
  }
}

/** The SSO form's plaintext convention: `${account}||${password}${unixSeconds}`. */
function credentialPlaintext(account: string, password: string, nowSeconds: number): string {
  return `${account}||${password}${nowSeconds}`
}

/** Encrypt one credential the way the SSO form does (RSA PKCS#1 v1.5, JSEncrypt convention). */
export function encryptCredential(
  publicKey: string,
  account: string,
  password: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const plaintext = credentialPlaintext(account, password, nowSeconds)
  return publicEncrypt(
    { key: loadPublicKey(publicKey), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(plaintext, 'utf8'),
  ).toString('base64')
}

/** Decrypt helper mirrored for tests: what the gateway does with the credential. */
export function decryptCredentialForTests(privateKey: KeyObject, encrypted: string): string {
  return privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(encrypted, 'base64'),
  ).toString('utf8')
}

/** Client for the uaa password surface. */
export class UaaPasswordClient {
  readonly #deps: UaaPasswordClientDeps
  readonly #now: () => number

  constructor(deps: UaaPasswordClientDeps) {
    this.#deps = deps
    this.#now = deps.now ?? Date.now
  }

  /**
   * Sign in with username and password; resolves the `uaa::code::` grant the
   * user-center exchanges for the JWT.
   */
  async signInWithPassword(username: string, password: string): Promise<string> {
    const publicKey = await this.#getPubKey()
    // Wire contract recovered from the SSO form (staging bundle, 2026-11-17):
    // flat body with `account` + `autoLogin`, and the RSA plaintext is
    // `${account}||${password}${unixSeconds}` — not the bare password.
    const encrypted = encryptCredential(publicKey, username, password, Math.floor(this.#now() / 1000))
    const data = await this.#post(`${UAA_BASE}/login/byAccount`, {
      account: username,
      password: encrypted,
      autoLogin: true,
    })
    const code = readCode(data)
    if (code === undefined) {
      throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'The sign-in response carried no SSO code.')
    }
    return code
  }

  async #getPubKey(): Promise<string> {
    // The SSO form names the key's purpose; a purposeless request may return
    // a different key type and the login then fails validation.
    const data = await this.#post(`${UAA_BASE}/cipher/getPubKey`, { from: 'browser', type: 'login' })
    const record = data === null || typeof data !== 'object' ? undefined : (data as Record<string, unknown>)
    const key =
      (typeof record?.['publicKey'] === 'string' && record['publicKey']) ||
      (typeof record?.['pubKey'] === 'string' && record['pubKey']) ||
      (typeof record?.['key'] === 'string' && record['key']) ||
      ''
    if (key.trim() === '') {
      throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'The sign-in gateway returned no public key.')
    }
    return key
  }

  async #post(path: string, body: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await this.#deps.fetch(`${this.#deps.config.ssoOrigin}${path}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(this.#deps.config.requestTimeoutMs),
      })
    } catch (cause) {
      throw new InkstoneAccountError('AUTH_NETWORK', 'The sign-in gateway could not be reached.', { cause })
    }
    if (!response.ok) {
      // verify-wire: the captcha challenge arrives as a distinct status or code.
      if (response.status === 401 || response.status === 403) {
        throw new InkstoneAccountError(
          'AUTH_CAPTCHA_REQUIRED',
          'The sign-in gateway requires a captcha; use the web page for this account for now.',
        )
      }
      throw new InkstoneAccountError('AUTH_REJECTED', `The sign-in gateway returned status ${response.status}.`)
    }
    let envelope: unknown
    try {
      envelope = (await response.json()) as unknown
    } catch (cause) {
      throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'The sign-in response was not JSON.', { cause })
    }
    if (envelope === null || typeof envelope !== 'object') {
      throw new InkstoneAccountError('AUTH_SERVICE_RESPONSE_INVALID', 'The sign-in response must be an object.')
    }
    const record = envelope as Record<string, unknown>
    const msgCode = record['msgCode']
    if (msgCode !== undefined && msgCode !== '10000' && msgCode !== 10000 && msgCode !== 0) {
      const message = typeof record['msg'] === 'string' && record['msg'] !== '' ? record['msg'] : 'The sign-in was rejected.'
      const detail = JSON.stringify(record).slice(0, 400)
      // B0501 is the human-verification gate (verified against staging);
      // the captcha loop lands with the first real-credential run.
      if (msgCode === 'B0501' || msgCode === 'B0502') {
        throw new InkstoneAccountError('AUTH_CAPTCHA_REQUIRED', `${message} [${detail}]`)
      }
      throw new InkstoneAccountError('AUTH_REJECTED', `${message} [${detail}]`)
    }
    return record['data'] ?? record
  }
}

function readCode(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  const candidates = [record['code'], record['grant'], record['ssoCode']]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith(CODE_PREFIX) && candidate.length <= 2048) {
      return candidate
    }
  }
  return undefined
}
