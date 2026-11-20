/**
 * 科研插件, browser half (KEP-0008): the sidebar's external platform-web rows
 * (论文工具 / 科研应用) and the research-catalog panel — the page's three
 * capability tabs, the entry icon's hover flyout, and the Settings shortcut.
 * The rows are metadata-only registrations in `sidebar.nav.links`; the Host
 * resolves the deployment's URLs (staging/production is config, not UI).
 * Everything panel-shaped lives behind `remoteAccess` for the catalog
 * endpoint: a deployment without the Host half shows neither page nor entry.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.remoteAccess Context merge.
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.slots Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the sidebar slot declarations this package registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the MainPanelId brand and ctx.layout.
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the `settings.section` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the generated ctx.remote.researchCatalog face.
import type {} from '@deepseek-ai/dsh-client-ui-research-plugins/remote'
import { createResearchCatalogController } from './catalog-store.ts'
import type { ResearchCatalogEntry } from '../types.ts'
import { en, ja, es, fr, de, ru, pt, zh, type ResearchPluginsKey } from './locales.ts'
import { ResearchPage } from './ResearchPage.tsx'
import { ResearchPanelIcon, type ResearchPanelIconFace } from './ResearchPanelIcon.tsx'
import { ResearchSettingsLink, type ResearchSettingsLinkInjected } from './ResearchSettingsLink.tsx'
import { createResearchNavigationStore } from './research-navigation-store.ts'
import type { ResearchTab } from './research-navigation-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 科研插件 surface copy. */
    'researchPlugins': ResearchPluginsKey
  }
  interface SlotMap {
    /** Extra content under the page's tab strip, before the list body. */
    'research.tab': { kind: 'list'; scope: 'root' }
    /** Extra content on every entry card, after its actions. */
    'research.entry': { kind: 'list'; scope: 'root'; owner: ResearchEntryOwnerProps }
    /** Extra sections at the foot of a detail view. */
    'research.detail.section': { kind: 'list'; scope: 'root'; owner: ResearchEntryOwnerProps }
  }
  interface ResearchEntryOwnerProps {
    /** The catalog entry the section renders beside. */
    entry: ResearchCatalogEntry
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'researchPlugins'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'research' as MainPanelId

/** Services required by the sidebar rows, the page, and access. */
export const inject = ['slots', 'locale', 'remote', 'remote.researchCatalog', 'layout', 'remoteAccess']

/** Metadata-only registrations carry no rendered component; the sidebar owns the rows. */
const NoRowComponent = (): null => null

/**
 * Contribute the platform-web link rows, the sidebar entry with its flyout,
 * and the catalog page. `href` rides the entry `inject` face: the slot
 * ledger projects options onto its own vocabulary (id/order/label/priority),
 * so per-entry data travels the same channel entry components receive at
 * render.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-research-plugins: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void ctx.remote.researchCatalog.links().then((answer) => {
      // An unavailable Host leaves the sidebar without the rows (KEP-0008).
      if (cancelled || !answer.ok) return
      const links = answer.value
      // Variables, not literals: the options carry the `inject` face beside
      // the shared fields, and the sidebar reads its own shape off them.
      const papers = {
        name: 'sidebar.nav.links', id: 'research.links.papers', order: 10,
        label: () => t('links.papers'), locale: NS,
        inject: () => ({ href: links.papers }),
      } as const
      const researchApps = {
        name: 'sidebar.nav.links', id: 'research.links.researchApps', order: 11,
        label: () => t('links.researchApps'), locale: NS,
        inject: () => ({ href: links.researchApps }),
      } as const
      stop = ctx.slots.inject('sidebar.nav.links', function* () {
        yield ctx.slots.register(papers, NoRowComponent)
        yield ctx.slots.register(researchApps, NoRowComponent)
      })
    }).catch((error: unknown) => {
      ctx.logger.warn('research links unavailable; sidebar rows skipped', error)
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, 'ui-research-plugins: link rows')

  // The panel half waits for the Host to answer the catalog endpoint: no
  // access, no entry, no page. One controller (and one navigation store)
  // feeds the page, the entry icon's flyout, and cross-navigation.
  ctx.effect(() => ctx.remoteAccess.whenAccess('researchCatalog/catalog', function* () {
    const controller = createResearchCatalogController(async () => {
      const answer = await ctx.remote.researchCatalog.catalog()
      if (!answer.ok) throw new Error('researchCatalog/catalog failed')
      return answer.value
    })
    // The read starts when access lands: the flyout counts fill before the
    // page ever opens, and a connection reset re-reads in place.
    controller.ensureLoad()
    yield ctx.on('connection/reset', () => { controller.refresh() })

    // Page selection, created before any registration so the icon's quick
    // entries can deep-open a tab; one instance is shared with every render.
    const handle = createResearchNavigationStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    const openTab = (tab: ResearchTab): void => {
      ctx.layout.selectPanel(PANEL_ID)
      instance.actions.setTab(tab)
    }
    const openResearch = (): void => {
      ctx.layout.selectPanel(PANEL_ID)
      instance.actions.closeDetail()
    }
    // Leaving the panel returns it to the list, so a return visit is a fresh
    // page rather than a stale detail view.
    yield ctx.layout.panelInfo.subscribe(() => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) instance.actions.closeDetail()
    })

    // The sidebar entry: glyph plus hover flyout of counted quick entries.
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 1,
      label: () => t('panel'),
      locale: NS,
      inject: (): ResearchPanelIconFace => ({ openTab, hooks: { catalog: controller.store } }),
    }, ResearchPanelIcon))

    // The page itself: a global panel belonging to the profile, not to a
    // Session; the sidebar's entry selects it. Extensions extend the page
    // through the declared children.
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      store,
      inject: () => ({ refresh: () => { controller.refresh() }, hooks: { catalog: controller.store } }),
      children: {
        'research.tab': { kind: 'list', scope: 'root' },
        'research.entry': { kind: 'list', scope: 'root' },
        'research.detail.section': { kind: 'list', scope: 'root' },
      },
    }, ResearchPage))

    // Settings lists one entry that leads here.
    yield ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section',
      id: PANEL_ID,
      order: 16,
      label: () => t('panel'),
      inject: (): ResearchSettingsLinkInjected => ({ openResearch }),
    }, ResearchSettingsLink))
  }), 'ui-research-plugins: research panel')
}
