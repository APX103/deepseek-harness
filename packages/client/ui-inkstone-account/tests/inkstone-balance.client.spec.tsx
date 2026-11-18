// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { InkstoneBalance } from '../src/client/InkstoneBalance.tsx'
import type { InkstoneBalanceSnapshot } from '../src/client/balance-source.ts'
import { en, zh, type InkstoneKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

function mount(snapshot: InkstoneBalanceSnapshot | undefined, copy: typeof en | typeof zh = zh) {
  render(<InkstoneBalance useBalance={selector => selector(snapshot)}
    t={(key, params) => {
      const template = key in copy ? copy[key as InkstoneKey] : key
      return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template)
    }} />)
}

it('renders the effective balance, qualified when a usage window binds', () => {
  mount({ credits: 9791.883, effectiveCredits: 9791.883, windows: [] })
  expect(screen.getByText('9791.883')).toBeTruthy()
  cleanup()
  mount({ credits: 9791.883, effectiveCredits: 600, windows: [{ id: '5h', limitCredits: 1000, usedCredits: 400, remainingCredits: 600 }] })
  expect(screen.getByText('600.000')).toBeTruthy()
  expect(screen.getByText('（5h 窗口）')).toBeTruthy()
})

it('renders nothing while the balance is unavailable', () => {
  mount(undefined, en)
  expect(screen.queryByText(en['balance.title'])).toBeNull()
})
