/**
 * The Inkstone sidebar brand occupants: the 书生 head and the two-tone
 * 「书生·端砚」 wordmark replace the local-build fallback in the Inkstone
 * composition (KEP-0002 D10 brand, KEP-0007 face).
 */
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS, type InkstoneKey } from './locales.ts'
import { InkstoneFaceMark } from './InkstoneFaceMark.tsx'
import css from './InkstoneBrand.module.css'

/**
 * @param props - Host-supplied mark presentation.
 * @returns the 书生 head mark.
 */
export function InkstoneBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <InkstoneFaceMark size={size} />
}

/** Wordmark props: the brand name is locale-owned copy. */
export type InkstoneBrandNameProps = PropsLocale<typeof NS>

/**
 * Render the brand name; a 「·」 splits the 书生 head-word from the product
 * word so the two halves can wear the prototype's two-tone (砚蓝 + ink).
 * Names without the separator render as one run.
 * @param props - locale copy seat.
 * @returns the Inkstone wordmark without its independently slotted mark.
 */
export function InkstoneBrandName({ t }: InkstoneBrandNameProps) {
  const name = t('brand.name' as InkstoneKey)
  const split = name.indexOf('·')
  return (
    <span className={css.name}>
      {split > 0
        ? (
          <>
            <span className={css.nameLead}>{name.slice(0, split)}</span>
            {name.slice(split)}
          </>
        )
        : name}
    </span>
  )
}
