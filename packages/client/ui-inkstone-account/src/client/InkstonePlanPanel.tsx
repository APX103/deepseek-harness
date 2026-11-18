/**
 * The Token Plan panel on the Models settings page (KEP-0005): the 墨点
 * balance hero with the binding-window qualifier, and 收支 / 墨点包 /
 * 提额申请 views fed by the loopback plan routes. Replaces the bare balance
 * footer row; the account launcher menu keeps its single balance row.
 */
import { useEffect, useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { InkstoneBalanceSource } from './balance-source.ts'
import { bindingWindow } from './balance-source.ts'
import { INKSTONE_MARK_URL } from './InkstoneMark.tsx'
import { NS, type InkstoneKey } from './locales.ts'
import type { InkstoneApplicationRow, InkstoneLedgerPage, InkstonePackageRow } from './plan-source.ts'
import { defaultLedgerRange } from './plan-source.ts'
import css from './InkstonePlanPanel.module.css'

const PAGE_SIZE = 10

type PlanTab = 'ledger' | 'packages' | 'applications'

/** Inject face: the balance hook and the plan table fetchers. */
export interface InkstonePlanFace {
  /** Balance binding the renderer exposes as the `useBalance` hook. */
  readonly hooks: { readonly balance: InkstoneBalanceSource }
  readonly fetchLedger: (start: string, end: string, page: number) => Promise<InkstoneLedgerPage | undefined>
  readonly fetchPackages: () => Promise<{ packages: readonly InkstonePackageRow[] } | undefined>
  readonly fetchApplications: () => Promise<{ applications: readonly InkstoneApplicationRow[] } | undefined>
}

/** Panel props: locale copy, the balance hook, and the table fetchers. */
export type InkstonePlanProps = PropsLocale<typeof NS> & InjectFace<InkstonePlanFace>

/**
 * @param props - locale seat, the balance hook, and the table fetchers.
 * @returns the Token Plan panel, or nothing while the balance is unavailable.
 */
export function InkstonePlanPanel({ useBalance, fetchLedger, fetchPackages, fetchApplications, t }: InkstonePlanProps) {
  const balance = useBalance(value => value)
  const [tab, setTab] = useState<PlanTab>('ledger')
  const [range] = useState(defaultLedgerRange)
  const [page, setPage] = useState(1)
  const [ledger, setLedger] = useState<InkstoneLedgerPage | undefined>(undefined)
  const [packages, setPackages] = useState<readonly InkstonePackageRow[] | undefined>(undefined)
  const [applications, setApplications] = useState<readonly InkstoneApplicationRow[] | undefined>(undefined)

  const loadLedger = (nextPage: number): void => {
    setPage(nextPage)
    void fetchLedger(range.start, range.end, nextPage).then((result) => {
      setLedger(result)
    })
  }
  const loadPackages = (): void => {
    void fetchPackages().then((result) => { setPackages(result?.packages) })
  }
  const loadApplications = (): void => {
    void fetchApplications().then((result) => { setApplications(result?.applications) })
  }
  // Initial load of the default tab; later loads are user gestures (tab and pager clicks).
  useEffect(() => { loadLedger(1) }, [])
  if (balance === undefined) return null
  const bound = bindingWindow(balance)
  const pages = Math.max(1, Math.ceil((ledger?.total ?? 0) / PAGE_SIZE))

  return (
    <div className={css.panel}>
      <div className={css.hero}>
        <img className={css.heroMark} src={INKSTONE_MARK_URL} width={22} height={22} alt="" draggable={false} />
        <span className={css.heroLabel}>{t('balance.title')}</span>
        <span className={css.heroValue}>{balance.effectiveCredits.toFixed(3)}</span>
        {bound !== undefined && <span className={css.heroWindow}>{t('balance.window.qualifier', { window: bound.id })}</span>}
      </div>
      <div className={css.tabs} role="tablist">
        {(['ledger', 'packages', 'applications'] as const).map(id => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={css.tab} data-active={tab === id}
            onClick={() => {
              setTab(id)
              if (id === 'ledger' && ledger === undefined) loadLedger(page)
              if (id === 'packages' && packages === undefined) loadPackages()
              if (id === 'applications' && applications === undefined) loadApplications()
            }}>
            {t(`plan.tab.${id}` as InkstoneKey)}
          </button>
        ))}
      </div>
      {tab === 'ledger'
        ? (
          <div className={css.tableWrap}>
            <div className={css.grid} data-cols="ledger">
              <span className={css.colHead}>{t('plan.ledger.date')}</span>
              <span className={css.colHead}>{t('plan.ledger.type')}</span>
              <span className={css.colHead}>{t('plan.ledger.scene')}</span>
              <span className={`${css.colHead} ${css.delta}`}>{t('plan.ledger.delta')}</span>
              {ledger === undefined
                ? <span className={css.empty}>{t('plan.ledger.empty')}</span>
                : ledger.items.length === 0
                  ? <span className={css.empty}>{t('plan.ledger.empty')}</span>
                  : ledger.items.flatMap((row, index) => [
                    <span key={`d${index}`} className={css.cell}>{row.occurredAt}</span>,
                    <span key={`t${index}`} className={css.cell}>{row.typeName !== '' ? row.typeName : row.channelName}</span>,
                    <span key={`s${index}`} className={`${css.cell} ${css.scene}`}>{row.remark}</span>,
                    <span key={`v${index}`} className={`${css.cell} ${css.delta}`} data-spend={row.creditDelta < 0}>
                      {row.creditDelta > 0 ? `+${row.creditDelta}` : String(row.creditDelta)}
                    </span>,
                  ])}
            </div>
            <div className={css.pager}>
              <button type="button" className={css.pageButton} disabled={page <= 1} onClick={() => { loadLedger(page - 1) }}>
                {t('plan.prev')}
              </button>
              <span className={css.pageIndicator}>{t('plan.page', { page, pages })}</span>
              <button type="button" className={css.pageButton} disabled={page >= pages} onClick={() => { loadLedger(page + 1) }}>
                {t('plan.next')}
              </button>
            </div>
          </div>
        )
        : null}
      {tab === 'packages'
        ? (
          <div className={css.grid} data-cols="packages">
            {packages === undefined || packages.length === 0
              ? <span className={css.empty}>{t('plan.packages.empty')}</span>
              : packages.flatMap((row, index) => [
                <span key={`n${index}`} className={css.cell}>{row.remark !== '' ? row.remark : row.pkgId}</span>,
                <span key={`r${index}`} className={css.cell}>{t('plan.packages.remaining', { remaining: row.remainingCredits.toFixed(3), total: row.totalCredits.toFixed(3) })}</span>,
                <span key={`c${index}`} className={css.cell}>{t('plan.packages.cycle', { start: row.cycleStart, end: row.cycleEnd })}</span>,
                <span key={`e${index}`} className={css.cell}>{row.expireAt}</span>,
              ])}
          </div>
        )
        : null}
      {tab === 'applications'
        ? (
          <div className={css.grid} data-cols="applications">
            {applications === undefined || applications.length === 0
              ? <span className={css.empty}>{t('plan.applications.empty')}</span>
              : applications.flatMap((row, index) => [
                <span key={`s${index}`} className={css.cell}>{row.scenarioName}</span>,
                <span key={`t${index}`} className={css.cell}>{row.status}</span>,
                <span key={`d${index}`} className={css.cell}>{row.appliedAt}</span>,
              ])}
          </div>
        )
        : null}
    </div>
  )
}
