/**
 * The Inkstone sidebar brand occupants: the 端砚 mark and wordmark replace
 * the local-build fallback in the Inkstone composition (KEP-0002 D10 brand).
 */
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type InkstoneKey } from './locales.ts'
import css from './InkstoneBrand.module.css'

/**
 * @param props - Host-supplied mark presentation.
 * @returns the Inkstone seal mark.
 */
export function InkstoneBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <span
      className={css.mark}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >端砚</span>
  )
}

/** Wordmark props: the brand name is locale-owned copy. */
export type InkstoneBrandNameProps = PropsLocale<typeof NS>

/**
 * @param props - locale copy seat.
 * @returns the Inkstone wordmark without its independently slotted mark.
 */
export function InkstoneBrandName({ t }: InkstoneBrandNameProps) {
  return <span className={css.name}>{t('brand.name' as InkstoneKey)}</span>
}
