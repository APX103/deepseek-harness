/**
 * Desktop SSO page sign-in (KEP-0003): the main process owns the login step.
 * At boot it asks the loopback session endpoint, and while the Inkstone
 * session is unauthenticated it opens the SSO sign-in page in a child window.
 * The page itself owns every verification flow; this module only recognizes
 * the registered redirect, captures the `uaa::code::` code, and hands it to
 * the session endpoint for the JWT exchange.
 *
 * @module dsh-desktop/inkstone-sign-in
 */
import { BrowserWindow } from 'electron'
import { readSsoCallbackCode } from '@deepseek-ai/dsh-client-ui-inkstone-account'

/** Outcome of one boot sign-in attempt. */
export type InkstoneSignInOutcome =
  | 'signed-in'
  | 'already-signed-in'
  | 'cancelled'
  | 'rejected'
  | 'unavailable'

/** Ask the session endpoint once and open the SSO page while signed out. */
export async function ensureSignedIn(injections: readonly unknown[]): Promise<InkstoneSignInOutcome> {
  const baseUrl = inkstoneSessionBaseUrl(injections)
  if (baseUrl === undefined) return 'unavailable'
  const session = await getJson<{ authenticated?: boolean }>(`${baseUrl}/session`)
  if (session.authenticated === true) return 'already-signed-in'
  const sso = await getJson<{ loginUrl?: string; redirectUrl?: string }>(`${baseUrl}/session/sso`)
  if (typeof sso.loginUrl !== 'string' || typeof sso.redirectUrl !== 'string') return 'unavailable'
  const code = await captureSsoCode(sso.loginUrl, sso.redirectUrl)
  if (code === null) return 'cancelled'
  const response = await fetch(`${baseUrl}/session/code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return response.ok ? 'signed-in' : 'rejected'
}

/** Extract the loopback session endpoint announced in the host boot injections. */
export function inkstoneSessionBaseUrl(injections: readonly unknown[]): string | undefined {
  for (const row of injections) {
    if (row === null || typeof row !== 'object') continue
    const candidate = row as Record<string, unknown>
    if (candidate['kind'] !== 'global' || candidate['name'] !== 'INKSTONE_ACCOUNT') continue
    const value = candidate['value']
    if (value === null || typeof value !== 'object') continue
    const baseUrl = (value as Record<string, unknown>)['baseUrl']
    if (typeof baseUrl === 'string' && baseUrl !== '') return baseUrl
  }
  return undefined
}

async function getJson<T extends object>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`inkstone session endpoint returned ${response.status}`)
  return await response.json() as T
}

/** Open the SSO page and resolve with the callback code once the page redirects; `null` when closed or navigated away. */
function captureSsoCode(loginUrl: string, redirectUrl: string): Promise<string | null> {
  return new Promise((resolvePromise) => {
    // The SSO page is a full desktop layout (background art beside the login
    // card); a phone-sized window clips it, so size it like a small desktop
    // browser and center it.
    const window = new BrowserWindow({
      width: 1080,
      height: 760,
      minWidth: 800,
      minHeight: 600,
      center: true,
      title: '登录 书生·端砚',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    let settled = false
    const finish = (code: string | null): void => {
      if (settled) return
      settled = true
      if (!window.isDestroyed()) window.close()
      resolvePromise(code)
    }
    const capture = (event: Electron.Event, url: string): void => {
      const code = readSsoCallbackCode(url, { redirectUrl })
      if (code === null) return
      event.preventDefault()
      finish(code)
    }
    window.webContents.on('will-navigate', (event, url) => capture(event, url))
    window.webContents.on('will-redirect', (event, url) => capture(event, url))
    window.on('closed', () => finish(null))
    void window.loadURL(loginUrl)
  })
}
