// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { InkstoneLauncher, type InkstoneLauncherFace } from '../src/client/InkstoneLauncher.tsx'
import type { InkstoneAccountSnapshot } from '../src/client/account-source.ts'
import { en, zh, type InkstoneKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

function faceOf(snapshot: InkstoneAccountSnapshot, signOut = vi.fn(() => Promise.resolve())): InkstoneLauncherFace {
  return {
    hooks: {
      account: { getSnapshot: () => snapshot, subscribe: () => () => {}, markSignedOut: () => {} },
      balance: { getSnapshot: () => 9791.883, subscribe: () => () => {} },
    },
    signOut,
  }
}

function mount(
  snapshot: InkstoneAccountSnapshot,
  copy: typeof en | typeof zh = zh,
  signOut = vi.fn(() => Promise.resolve()),
  openSettings = vi.fn(),
) {
  const face = faceOf(snapshot, signOut)
  render(<InkstoneLauncher {...({} as GlobalStandardProps)} {...face} wide
    settingsOpen={false} openSettings={openSettings} openOnboarding={() => {}}
    useAccount={selector => selector(snapshot)}
    useBalance={selector => selector(9791.883)}
    t={key => (key in copy ? copy[key as InkstoneKey] : key)} />)
  return face
}

const signedIn: InkstoneAccountSnapshot = {
  status: 'signed-in',
  user: { ssoUid: '20101151', username: 'OpenXLab-DErrZuxIZ', nickname: '端砚用户', avatar: 'https://img.example/avatar.png' },
  expiresAtMs: 1_900_000_000_000,
}

it('shows the avatar, nickname, and a menu with settings, the UID, and sign-out', async () => {
  const signOut = vi.fn(() => Promise.resolve())
  const openSettings = vi.fn()
  mount(signedIn, zh, signOut, openSettings)
  fireEvent.click(screen.getByRole('button', { name: zh['menu.aria'] }))
  expect(await screen.findByText(new RegExp(`${zh['menu.uid']} 20101151`))).toBeTruthy()
  expect(screen.getByText(/9791\.883/)).toBeTruthy()
  fireEvent.click(screen.getByText(zh['menu.signOut']))
  expect(signOut).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: zh['menu.aria'] }))
  fireEvent.click(await screen.findByText(zh['menu.settings']))
  expect(openSettings).toHaveBeenCalledOnce()
})

it('falls back to the initial letter when the avatar is absent', () => {
  mount({ status: 'signed-in', user: { ssoUid: '1', username: 'plain-user' } }, en)
  expect(screen.getByText('P')).toBeTruthy()
  expect(screen.getByText('plain-user')).toBeTruthy()
})

it('renders the signed-out row without a sign-out action', async () => {
  const signOut = vi.fn(() => Promise.resolve())
  mount({ status: 'signed-out' }, en, signOut)
  expect(screen.getByText(en['label.signedOut'])).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en['menu.aria'] }))
  const item = await screen.findByRole('menuitem', { name: en['menu.signOut'] }) as HTMLButtonElement
  expect(item.disabled).toBe(true)
})
