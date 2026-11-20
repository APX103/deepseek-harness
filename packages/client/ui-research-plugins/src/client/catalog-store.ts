/** The shared catalog read behind the 科研插件 page and the sidebar flyout (KEP-0008). */
import { defineStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResearchCatalogDocument } from '../types.ts'

/** The catalog read lifecycle the page and flyout render. */
export type ResearchLoad =
  | { status: 'loading' }
  | { status: 'ready'; document: ResearchCatalogDocument }
  | { status: 'failed' }

/** The joined-catalog read controller shared by the page, the icon flyout, and navigation. */
export interface ResearchCatalogController {
  /** The read lifecycle source; bound into entry inject faces as useCatalog. */
  readonly store: ObservableSnapshot<ResearchLoad>
  /** Start the first read; a no-op once a read has started. */
  readonly ensureLoad: () => void
  /** Re-read the Host unconditionally (page refresh, retry, connection reset). */
  readonly refresh: () => void
}

/**
 * Create the catalog controller over one Host read. Reads are serialized:
 * a refresh during an in-flight read is folded into it, and a failed read
 * flips the store to failed (the page offers 重试) rather than dropping rows.
 * @param read - the Host catalog read, rejecting on transport failure.
 * @returns the controller with its observable store.
 */
export function createResearchCatalogController(read: () => Promise<ResearchCatalogDocument>): ResearchCatalogController {
  const handle = defineStore({
    init: (): ResearchLoad => ({ status: 'loading' }),
    actions: {
      begin: (draft) => { draft.status = 'loading' },
      ready: (draft, document: ResearchCatalogDocument) => {
        draft.status = 'ready'
        // Assigning the discriminant does not narrow the union draft; the
        // payload ride-along needs the ready shape spelled out.
        ;(draft as { document: ResearchCatalogDocument }).document = document
      },
      failed: (draft) => { draft.status = 'failed' },
    },
  })
  const instance = handle.create()
  let inFlight = false
  const run = (): void => {
    if (inFlight) return
    inFlight = true
    instance.actions.begin()
    void read().then((document) => {
      inFlight = false
      instance.actions.ready(document)
    }).catch(() => {
      inFlight = false
      instance.actions.failed()
    })
  }
  return {
    store: instance,
    ensureLoad: () => {
      // The initial state is the pre-read loading; any completed or in-flight read makes this a no-op.
      if (inFlight) return
      if (instance.getSnapshot().status !== 'loading') return
      run()
    },
    refresh: run,
  }
}
