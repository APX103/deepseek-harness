/** The 科研插件 catalog page: three capability tabs, a 研究阶段 rail, entry cards, and detail views (KEP-0008). */
import { useMemo, useState, type ReactNode } from 'react'
import { Toast, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResearchCatalogDocument, ResearchCatalogItem, ResearchCategory } from '../types.ts'
import type { ResearchLoad } from './catalog-store.ts'
import type { createResearchNavigationStore, ResearchTab } from './research-navigation-store.ts'
import css from './ResearchPage.module.css'

/** What the plugin injects beside the runtime share. */
export interface ResearchPageInjected {
  /** Re-read the catalog from the Host (the page's refresh and the failed view's retry). */
  readonly refresh: () => void
  /** The joined catalog read, bound by the renderer as useCatalog. */
  readonly hooks: { readonly catalog: ObservableSnapshot<ResearchLoad> }
}

/** Full page props: the main panel's runtime share, the page store, injected catalog hooks, and locale. */
export type ResearchPageProps =
  PropsRuntime<'main'>
  & PropsStore<ReturnType<typeof createResearchNavigationStore>>
  & InjectFace<ResearchPageInjected>
  & PropsLocale<'researchPlugins'>
  & PropsRenderSlots<'research.tab' | 'research.entry' | 'research.detail.section'>

/** The 研究阶段 rail order (the literal union keeps the typed `t` keys exact). */
const STAGES = ['literature', 'topic', 'data', 'viz', 'writing', 'outreach', 'office'] as const

/** The rail vocabulary, in display order. */
type RailKey = 'all' | ResearchCategory | 'uncategorized'

/** One tab's slice of the document. */
function sectionOf(document: ResearchCatalogDocument, tab: ResearchTab): readonly ResearchCatalogItem[] {
  return tab === 'skills' ? document.skills : tab === 'connectors' ? document.connectors : document.agents
}

/**
 * Render the research-capabilities catalog page.
 * @param props - composed slot props (main runtime + store + injected + locale).
 * @returns the page element tree.
 */
export function ResearchPage(props: ResearchPageProps): ReactNode {
  const { t, useStore, actions, useCatalog, refresh, renderSlot } = props
  const nav = useStore(state => state)
  const load = useCatalog(snapshot => snapshot)
  // The registration starts the first read when access lands; the store is
  // already progressing (or ready) by the time the page mounts.
  const counts = useMemo(() => {
    if (load.status !== 'ready') return { skills: 0, connectors: 0, agents: 0 }
    return {
      skills: load.document.skills.length,
      connectors: load.document.connectors.length,
      agents: load.document.agents.length,
    }
  }, [load])
  const [copiedToast, setCopiedToast] = useState<number | null>(null)
  const copyPrompt = (prompt: string) => (): void => {
    void writeClipboard(prompt).then((ok) => {
      if (ok) setCopiedToast(seq => (seq ?? 0) + 1)
    })
  }

  if (load.status === 'loading') {
    return <div className={css.page}><span className={css.spinner} role="status" aria-label={t('panel')} /></div>
  }
  if (load.status === 'failed') {
    return (
      <div className={css.page}>
        <div className={css.failedState}>
          <p className={css.failedText}>{t('page.failed')}</p>
          <button type="button" className={css.retryButton} onClick={refresh}>{t('page.retry')}</button>
        </div>
      </div>
    )
  }

  const document = load.document
  const items = sectionOf(document, nav.tab)
  const stages: readonly RailKey[] = [
    ...STAGES.filter((stage): stage is ResearchCategory => items.some(item => item.entry.category === stage)),
    ...(items.some(item => item.entry.category === undefined) ? ['uncategorized' as const] : []),
  ]
  const rail = ['all', ...stages] as const
  const visible = nav.category === 'all' ? items : items.filter(item => (item.entry.category ?? 'uncategorized') === nav.category)

  const selectedId = nav.selection.kind === 'detail' ? nav.selection.id : undefined
  const detail = selectedId !== undefined
    ? [...document.skills, ...document.connectors, ...document.agents]
      .find(item => item.entry.id === selectedId)
    : undefined

  const badge = (item: ResearchCatalogItem): ReactNode => (
    <span className={item.runtime.present ? css.badgeAvailable : css.badgeUnavailable}>
      {item.runtime.present ? t('badge.available') : t('badge.unavailable')}
    </span>
  )
  const sourceBadge = (item: ResearchCatalogItem): ReactNode | null => (
    item.entry.source === 'bundled' ? <span className={css.sourceBadge}>{t('badge.bundled')}</span>
      : item.entry.source === 'hub' ? <span className={css.sourceBadge}>{t('badge.hub')}</span>
        : item.entry.source === 'runtime' ? <span className={css.sourceBadge}>{t('badge.runtime')}</span>
          : null
  )

  return (
    <div className={css.page}>
      <header className={css.header}>
        <div className={css.tabs} role="tablist">
          {(['skills', 'connectors', 'agents'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={nav.tab === tab}
              className={nav.tab === tab ? css.tabActive : css.tab}
              onClick={() => { actions.setTab(tab) }}
            >
              {t(`tab.${tab}`)}
              <span className={css.tabCount}>{counts[tab]}</span>
            </button>
          ))}
        </div>
        <div className={css.headerTail}>
          <span className={css.updated}>{t('page.updated', { time: new Date(document.updatedAt).toLocaleTimeString() })}</span>
          <button type="button" className={css.refresh} onClick={refresh} aria-label={t('page.refresh')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>
      {renderSlot('research.tab', {})}
      {detail !== undefined ? (
        <section className={css.detail}>
          <button type="button" className={css.back} onClick={() => { actions.closeDetail() }}>← {t('detail.back')}</button>
          <div className={css.detailHead}>
            <h2 className={css.detailName}>{detail.entry.name}</h2>
            {badge(detail)}
            {sourceBadge(detail)}
          </div>
          {detail.entry.description !== '' && <p className={css.detailDescription}>{detail.entry.description}</p>}
          <dl className={css.detailFacts}>
            {detail.entry.category !== undefined && (
              <>
                <dt className={css.factLabel}>{t('detail.stage')}</dt>
                <dd className={css.factValue}>{t(`category.${detail.entry.category}`)}</dd>
              </>
            )}
            <dt className={css.factLabel}>{t('detail.runtime')}</dt>
            <dd className={css.factValue}>
              {detail.runtime.present ? t('badge.available') : t('badge.unavailable')}
              {detail.runtime.status !== undefined && !detail.runtime.present ? ` · ${detail.runtime.status}` : ''}
            </dd>
          </dl>
          {!detail.runtime.present && <p className={css.enableHint}>{t(`detail.enableHint.${detail.entry.kind}`)}</p>}
          {detail.entry.samplePrompts.length > 0 && (
            <div className={css.detailPrompts}>
              <h3 className={css.promptsTitle}>{t('detail.prompts')}</h3>
              {detail.entry.samplePrompts.map(prompt => (
                <button key={prompt} type="button" className={css.promptRow} onClick={copyPrompt(prompt)}>
                  <span className={css.promptText}>{prompt}</span>
                  <span className={css.promptTry}>{t('card.try')}</span>
                </button>
              ))}
            </div>
          )}
          {renderSlot('research.detail.section', { entry: detail.entry })}
        </section>
      ) : (
        <div className={css.body}>
          <nav className={css.rail} aria-label={t('category.all')}>
            {rail.map(stage => (
              <button
                key={stage}
                type="button"
                className={nav.category === stage ? css.railActive : css.railRow}
                onClick={() => { actions.setCategory(stage) }}
              >
                {t(`category.${stage}`)}
              </button>
            ))}
          </nav>
          <div className={css.cards}>
            {visible.length === 0 ? (
              <p className={css.emptyState}>{t(`page.empty.${nav.tab}`)}</p>
            ) : (
              visible.map(item => (
                <article key={item.entry.id} className={css.card}>
                  <div className={css.cardHead}>
                    <h3 className={css.cardName}>{item.entry.name}</h3>
                    {badge(item)}
                    {sourceBadge(item)}
                  </div>
                  <p className={css.cardDescription}>{item.entry.description !== '' ? item.entry.description : item.entry.ref}</p>
                  <div className={css.cardActions}>
                    {item.entry.samplePrompts.length > 0 && (
                      <button type="button" className={css.tryButton} onClick={copyPrompt(item.entry.samplePrompts[0] ?? '')}>
                        {t('card.try')}
                      </button>
                    )}
                    <button type="button" className={css.detailButton} onClick={() => { actions.openDetail(item.entry.id) }}>
                      {t('card.detail')}
                    </button>
                  </div>
                  {renderSlot('research.entry', { entry: item.entry })}
                </article>
              ))
            )}
          </div>
        </div>
      )}
      {copiedToast !== null && (
        <Toast key={copiedToast} tone="success" text={t('card.copied')} onDone={() => { setCopiedToast(null) }} />
      )}
    </div>
  )
}
