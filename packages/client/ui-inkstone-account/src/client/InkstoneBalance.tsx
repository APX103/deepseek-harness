/**
 * The Inkstone 墨点 balance row for the Models settings page footer
 * (KEP-0002 M3): the Token Plan balance behind the signed-in account, with
 * the desktop's three-decimal presentation.
 */
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { InkstoneBalanceSource } from './balance-source.ts'
import { NS } from './locales.ts'
import css from './InkstoneBalance.module.css'

/** Inject face: the balance snapshot source. */
export interface InkstoneBalanceFace {
  /** Balance binding the renderer exposes as the `useBalance` hook. */
  readonly hooks: { readonly balance: InkstoneBalanceSource }
}

/** Footer props: locale copy and the balance hook. */
export type InkstoneBalanceProps = PropsLocale<typeof NS> & InjectFace<InkstoneBalanceFace>

/**
 * @param props - locale copy seat and the balance hook.
 * @returns the balance row, or nothing while the balance is unavailable.
 */
export function InkstoneBalance({ useBalance, t }: InkstoneBalanceProps) {
  const credits = useBalance(value => value)
  if (credits === undefined) return null
  return (
    <div className={css.row}>
      <span className={css.label}>{t('balance.title')}</span>
      <span className={css.value}>{credits.toFixed(3)}</span>
    </div>
  )
}
