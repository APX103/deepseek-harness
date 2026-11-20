/** The 科研插件 sidebar entry: the glyph plus a hover flyout of quick, counted entries (KEP-0008). */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResearchLoad } from './catalog-store.ts'
import type { ResearchTab } from './research-navigation-store.ts'
import css from './ResearchPage.module.css'

/** What the entry receives from the registration. */
export interface ResearchPanelIconFace {
  /** Deep-open the panel on one capability tab. */
  readonly openTab: (tab: ResearchTab) => void
  /** The joined catalog read, bound by the renderer as useCatalog. */
  readonly hooks: { readonly catalog: ObservableSnapshot<ResearchLoad> }
}

/** Full icon props: the sidebar's icon share, the injected face, and the entry's locale. */
export type ResearchPanelIconProps =
  PropsRuntime<'sidebar.panellist'>
  & InjectFace<ResearchPanelIconFace>
  & PropsLocale<'researchPlugins'>

/** Tab order in the flyout matches the page's tab strip. */
const TABS = ['skills', 'connectors', 'agents'] as const

/** Hover-out grace before the flyout closes, so the gap to the card is crossable. */
const CLOSE_DELAY_MS = 200

/**
 * Render the 科研插件 glyph and, on row hover or focus, a fixed-position
 * flyout with one counted quick entry per capability tab; a quick entry
 * deep-opens the panel on that tab. Escape closes; leaving the row and the
 * card closes after a grace. The hover anchor is the sidebar's whole row
 * button (the glyph only draws its leading glyph), matching the prototype.
 * @param props - the sidebar's icon share plus the injected face and locale.
 * @returns the icon element, with the flyout portaled to the body while open.
 */
export function ResearchPanelIcon(props: ResearchPanelIconProps): ReactNode {
  const { size, active, t, useCatalog, openTab } = props
  const load = useCatalog(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const cancelClose = useCallback((): void => { window.clearTimeout(closeTimer.current) }, [])
  const scheduleClose = useCallback((): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => { setOpen(false) }, CLOSE_DELAY_MS)
  }, [cancelClose])
  const show = useCallback((): void => {
    cancelClose()
    // Anchor beside the sidebar column (the row button spans it), like the
    // prototype's flyout: over the column would shadow the rows below.
    const row = hostRef.current?.closest('button')?.getBoundingClientRect()
    const glyph = hostRef.current?.getBoundingClientRect()
    if (row !== undefined) {
      const top = glyph?.top ?? row.top
      setAnchor({ top: Math.min(top, window.innerHeight - 168), left: row.right + 10 })
    }
    setOpen(true)
  }, [cancelClose])

  // The sidebar owns the row; hover and focus land on its button, so the
  // listeners attach there rather than to the glyph this component draws.
  useEffect(() => {
    const row = hostRef.current?.closest('button')
    if (row == null) return
    row.addEventListener('mouseenter', show)
    row.addEventListener('mouseleave', scheduleClose)
    row.addEventListener('focusin', show)
    return () => {
      row.removeEventListener('mouseenter', show)
      row.removeEventListener('mouseleave', scheduleClose)
      row.removeEventListener('focusin', show)
    }
  }, [show, scheduleClose])
  useEffect(() => () => { window.clearTimeout(closeTimer.current) }, [])
  // Selecting the panel (the row's own click) dismisses the flyout.
  useEffect(() => {
    if (active) {
      window.clearTimeout(closeTimer.current)
      setOpen(false)
    }
  }, [active])

  const go = (tab: ResearchTab) => (): void => {
    setOpen(false)
    openTab(tab)
  }

  const counts: Record<ResearchTab, number> = load.status === 'ready'
    ? {
      skills: load.document.skills.length,
      connectors: load.document.connectors.length,
      agents: load.document.agents.length,
    }
    : { skills: 0, connectors: 0, agents: 0 }

  return (
    <span ref={hostRef} className={css.iconHost}>
      <IconCordisPluginOutlineRegular size={size} />
      {open && anchor !== null && createPortal(
        <div
          className={css.flyout}
          style={{ top: anchor.top, left: anchor.left }}
          role="dialog"
          aria-label={t('panel')}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
        >
          {TABS.map(tab => (
            <button key={tab} type="button" className={css.flyoutRow} onClick={go(tab)}>
              <span>{t(`flyout.${tab}`)}</span>
              <span className={css.flyoutCount}>{counts[tab]}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}
