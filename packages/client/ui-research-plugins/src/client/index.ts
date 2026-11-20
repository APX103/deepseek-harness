/**
 * 科研插件, browser half (KEP-0008): the sidebar's external platform-web rows
 * (论文工具 / 科研应用) and, with the page phases, the research-catalog panel.
 * The rows are metadata-only registrations in `sidebar.nav.links`; the Host
 * resolves the deployment's URLs (staging/production is config, not UI).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the ctx.remote Context merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.slots Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the sidebar slot declarations this package registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the generated ctx.remote.researchCatalog face.
import type {} from '@deepseek-ai/dsh-client-ui-research-plugins/remote'
import { en, ja, es, fr, de, ru, pt, zh, type ResearchPluginsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 科研插件 surface copy. */
    'researchPlugins': ResearchPluginsKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'researchPlugins'

/** Services required by the sidebar rows (the page phases extend this). */
export const inject = ['slots', 'locale', 'remote', 'remote.researchCatalog']

/** Metadata-only registrations carry no rendered component; the sidebar owns the rows. */
const NoRowComponent = (): null => null

/**
 * Contribute the platform-web link rows to the sidebar while the Host's
 * research-catalog Remote answers; a failed links read leaves the sidebar
 * without the rows rather than with dead ones.
 *
 * `href` rides the entry `inject` face: the slot ledger projects options onto
 * its own vocabulary (id/order/label/priority), so per-entry data travels the
 * same channel entry components receive at render.
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
}
