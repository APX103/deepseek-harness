/**
 * The Inkstone sign-in surface, browser half (KEP-0002 D10, KEP-0003): a
 * full-screen 登录 gate over the injected session endpoint while the
 * inkstone-account session is unauthenticated, plus the signed-in account
 * launcher in the sidebar foot (avatar, name, UID, sign-out).
 *
 * KEP-0003 moved the sign-in itself into the desktop shell's SSO page window;
 * the gate stays a brand page with a hint, registration stays on the web, and
 * the launcher is the visible account surface with the sign-out entry.
 *
 * @module dsh-client-ui-inkstone-account/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { inkstoneAccountGlobal } from '../global.ts'
import { createInkstoneAccountSource } from './account-source.ts'
import { createInkstoneBalanceSource } from './balance-source.ts'
import { fetchApplications, fetchLedger, fetchPackages } from './plan-source.ts'
import { InkstonePlanPanel } from './InkstonePlanPanel.tsx'
import type { InkstonePlanFace } from './InkstonePlanPanel.tsx'
import { InkstoneBrandMark, InkstoneBrandName } from './InkstoneBrand.tsx'
import { InkstoneHeroMark } from './InkstoneHeroMark.tsx'
import { InkstoneLauncher } from './InkstoneLauncher.tsx'
import type { InkstoneLauncherFace } from './InkstoneLauncher.tsx'
import { en, zh, NS } from './locales.ts'

export type { InkstoneAccountSnapshot, InkstoneAccountSource } from './account-source.ts'
export type { InkstoneBalanceSnapshot, InkstoneBalanceSource } from './balance-source.ts'
export type { InkstonePlanFace, InkstonePlanProps } from './InkstonePlanPanel.tsx'
export type { InkstoneApplicationRow, InkstoneLedgerPage, InkstoneLedgerRow, InkstonePackageRow } from './plan-source.ts'
export type { InkstoneBrandNameProps } from './InkstoneBrand.tsx'
export type { InkstoneLauncherFace, InkstoneLauncherProps } from './InkstoneLauncher.tsx'
export type { InkstoneKey } from './locales.ts'

/** Required client services: the slot ledger and the locale registry. */
export const inject: readonly string[] = ['slots', 'locale']

interface SessionResponse {
  readonly authenticated?: boolean
}

/** @param ctx - client plugin context. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'inkstone-account: dictionaries')
  // The product face is not account-gated: the brand and hero seats register
  // unconditionally so the Inkstone surface keeps its face even while the
  // account endpoint is unreachable (KEP-0007). The gate, launcher, and plan
  // panel below stay endpoint-gated.
  ctx.effect(() => ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark', locale: NS }, InkstoneBrandMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, InkstoneBrandName)
  })), 'inkstone-account: brand')
  ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
    name: 'conversation.hero.brand.mark',
  }, InkstoneHeroMark)), 'inkstone-account: hero mark')
  const endpoint = inkstoneAccountGlobal()
  if (endpoint === undefined) return () => Promise.resolve()
  let session: SessionResponse
  try {
    const response = await fetch(`${endpoint.baseUrl}/session`, { headers: { accept: 'application/json' } })
    session = (await response.json()) as SessionResponse
  } catch {
    // Without a reachable endpoint the account surfaces stay down; the brand
    // face above is already on.
    return () => Promise.resolve()
  }
  const source = createInkstoneAccountSource(endpoint.baseUrl)
  const balance = createInkstoneBalanceSource(endpoint.baseUrl)
  let gate: (() => void) | undefined
  ctx.effect(() => ctx.slots.inject('settings.launcher', () => ctx.slots.register({
    name: 'settings.launcher',
    locale: NS,
    inject: (): InkstoneLauncherFace => ({
      hooks: { account: source, balance },
      refreshBalance: () => { balance.refresh() },
      signOut: async () => {
        await fetch(`${endpoint.baseUrl}/session`, { method: 'DELETE' })
        source.markSignedOut()
        // The desktop shell opens the SSO window at boot only; after a
        // sign-out the gate remounts and asks for a restart.
        gate ??= mountGate(endpoint.registerUrl)
      },
    }),
  }, InkstoneLauncher)), 'inkstone-account: launcher')
  ctx.effect(() => ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'inkstone-plan',
    locale: NS,
    inject: (): InkstonePlanFace => ({
      hooks: { balance },
      fetchLedger: (start, end, page) => fetchLedger(endpoint.baseUrl, start, end, page),
      fetchPackages: () => fetchPackages(endpoint.baseUrl),
      fetchApplications: () => fetchApplications(endpoint.baseUrl),
    }),
  }, InkstonePlanPanel)), 'inkstone-account: plan panel')
  if (session.authenticated === true) return () => Promise.resolve()
  gate = mountGate(endpoint.registerUrl)
  return () => {
    gate?.()
    return Promise.resolve()
  }
}

function mountGate(registerUrl: string): () => void {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-inkstone-login', '')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:radial-gradient(1200px 600px at 20% -10%, #2c3e67 0%, #141b2d 55%, #0d1220 100%)',
    'font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'width:340px',
    'padding:36px 32px 28px',
    'border-radius:16px',
    'background:#ffffff',
    'box-shadow:0 24px 64px rgba(6,10,20,.45)',
    'text-align:center',
  ].join(';')

  const mark = document.createElement('div')
  mark.textContent = '端砚'
  mark.style.cssText = ['width:56px', 'height:56px', 'margin:0 auto 14px', 'border-radius:14px', 'line-height:56px', 'font-size:22px', 'color:#f5f1e6', 'background:linear-gradient(135deg,#2f3b52,#111722)'].join(';')

  const title = document.createElement('h1')
  title.textContent = '端砚 Inkstone'
  title.style.cssText = ['margin:0 0 6px', 'font-size:22px', 'color:#17202f'].join(';')

  const subtitle = document.createElement('p')
  subtitle.textContent = '上海人工智能实验室 · 书生生态'
  subtitle.style.cssText = ['margin:0 0 24px', 'font-size:13px', 'color:#7a8496'].join(';')

  // The desktop turns this page into the login page through an IPC bridge;
  // a plain browser has no bridge, so the button only restates the hint there.
  const signIn = document.createElement('button')
  signIn.type = 'button'
  signIn.textContent = '登 录'
  signIn.style.cssText = [
    'width:100%',
    'padding:10px 0',
    'border:none',
    'border-radius:8px',
    'background:#1f2b45',
    'color:#f5f1e6',
    'font-size:15px',
    'cursor:pointer',
  ].join(';')

  const hint = document.createElement('p')
  hint.setAttribute('role', 'status')
  hint.style.cssText = ['min-height:18px', 'margin:12px 0 0', 'font-size:12px', 'color:#7a8496'].join(';')
  signIn.addEventListener('click', () => {
    const desktop = (globalThis as { dshDesktop?: { inkstoneSignIn?: () => Promise<string> } }).dshDesktop
    if (desktop?.inkstoneSignIn === undefined) {
      hint.textContent = '当前环境无法打开登录页，请重启应用后再试'
      return
    }
    hint.textContent = '正在进入登录页…'
    signIn.disabled = true
    void desktop.inkstoneSignIn().then((outcome: string) => {
      signIn.disabled = false
      if (outcome === 'signed-in') {
        hint.textContent = '登录成功，正在进入…'
        location.reload()
      } else {
        hint.textContent = outcome === 'cancelled' ? '登录已取消' : '登录失败，请重试'
      }
    }).catch(() => {
      signIn.disabled = false
      hint.textContent = '登录失败，请重试'
    })
  })

  const register = document.createElement('p')
  register.style.cssText = ['margin:14px 0 0', 'font-size:12px', 'color:#98a1b3'].join(';')
  register.textContent = '还没有账号？'
  if (registerUrl !== '') {
    const link = document.createElement('a')
    link.href = registerUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = '去网页注册'
    link.style.color = '#2f5cc4'
    register.appendChild(link)
  }

  card.append(mark, title, subtitle, signIn, hint, register)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  return () => {
    overlay.remove()
  }
}
