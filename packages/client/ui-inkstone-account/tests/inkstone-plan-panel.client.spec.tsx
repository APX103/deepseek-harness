// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InkstonePlanPanel } from '../src/client/InkstonePlanPanel.tsx'
import type { InkstoneBalanceSnapshot } from '../src/client/balance-source.ts'
import { en, zh, type InkstoneKey } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const balance: InkstoneBalanceSnapshot = { credits: 9791.883, effectiveCredits: 1000, windows: [{ id: '5h', limitCredits: 1000, usedCredits: 0, remainingCredits: 1000 }] }
const ledgerPage = {
  total: 14,
  items: [
    { occurredAt: '2026-11-18', typeName: '消费', channelName: '对话消费', creditDelta: -1.673, remark: 'TokenPlan模型调用-GLM-5.3-3rd', model: 'glm-5.3-3rd' },
    { occurredAt: '2026-11-17', typeName: '消费', channelName: '对话消费', creditDelta: -0.926, remark: 'TokenPlan模型调用-Qwen3.7-Plus-3rd-v2', model: 'qwen3.7-plus-3rd-v2' },
  ],
}
const packages = [{ pkgId: 'pkg_free_monthly_base', cycleType: 'monthly', cycleStart: '2026-11-03 20:00:41', cycleEnd: '2026-12-04 00:00:00', totalCredits: 10000, remainingCredits: 9790.21, status: 'available', kindName: '平台发放', remark: '每月免费基础包', expireAt: '2099-12-31 23:59:59' }]
const applications = [{ id: 'a1', scenarioName: '科研项目', status: 'pending', appliedAt: '2026-11-10 12:00:00' }]

function mount(copy: typeof en | typeof zh = zh, fetchLedger = vi.fn(async () => ledgerPage)) {
  const fetchPackages = vi.fn(async () => ({ packages }))
  const fetchApplications = vi.fn(async () => ({ applications }))
  render(<InkstonePlanPanel
    fetchLedger={fetchLedger} fetchPackages={fetchPackages} fetchApplications={fetchApplications}
    useBalance={selector => selector(balance)}
    t={(key, params) => {
      const template = key in copy ? copy[key as InkstoneKey] : key
      return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template)
    }} />)
  return { fetchLedger, fetchPackages, fetchApplications }
}

it('renders the hero with the effective balance and window qualifier, then the ledger', async () => {
  const { fetchLedger } = mount()
  expect(screen.getByText('1000.000')).toBeTruthy()
  expect(screen.getByText('（5h 窗口）')).toBeTruthy()
  expect(await screen.findByText('TokenPlan模型调用-GLM-5.3-3rd')).toBeTruthy()
  expect(screen.getByText('-1.673')).toBeTruthy()
  expect(fetchLedger).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 1)
})

it('switches tabs and fetches packages and applications on demand', async () => {
  const { fetchPackages, fetchApplications } = mount()
  fireEvent.click(screen.getByRole('tab', { name: zh['plan.tab.packages'] }))
  expect(await screen.findByText('每月免费基础包')).toBeTruthy()
  expect(fetchPackages).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('tab', { name: zh['plan.tab.applications'] }))
  expect(await screen.findByText('科研项目')).toBeTruthy()
  expect(fetchApplications).toHaveBeenCalledOnce()
})

it('pages the ledger with the pager', async () => {
  const { fetchLedger } = mount()
  await screen.findByText('TokenPlan模型调用-GLM-5.3-3rd')
  fireEvent.click(screen.getByRole('button', { name: zh['plan.next'] }))
  expect(fetchLedger).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 2)
  fireEvent.click(screen.getByRole('button', { name: zh['plan.prev'] }))
  expect(fetchLedger).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 1)
})

it('renders nothing while the balance is unavailable', () => {
  render(<InkstonePlanPanel
    fetchLedger={vi.fn(async () => undefined)} fetchPackages={vi.fn(async () => undefined)} fetchApplications={vi.fn(async () => undefined)}
    useBalance={selector => selector(undefined)}
    t={key => key} />)
  expect(screen.queryByText(en['balance.title'])).toBeNull()
})
