/** 科研插件 page selection shared by the page, the flyout, and cross-navigation (KEP-0008). */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** The page's three capability tabs. */
export type ResearchTab = 'skills' | 'connectors' | 'agents'

/** The list, or one entry's detail view. */
export type ResearchSelection = { readonly kind: 'list' } | { readonly kind: 'detail'; readonly id: string }

/** Tab, 研究阶段 rail selection, and list-or-detail. */
export type ResearchNavigationState = {
  tab: ResearchTab
  category: string
  selection: ResearchSelection
}
export type ResearchNavigationActions = {
  setTab: (draft: ResearchNavigationState, tab: ResearchTab) => void
  setCategory: (draft: ResearchNavigationState, category: string) => void
  openDetail: (draft: ResearchNavigationState, id: string) => void
  closeDetail: (draft: ResearchNavigationState) => void
}

/**
 * Create 科研插件 page selection before the first page render.
 * @returns the registration-owned navigation store handle.
 */
export function createResearchNavigationStore(): EngineStoreHandle<ResearchNavigationState, ResearchNavigationActions> {
  return defineStore({
    init: (): ResearchNavigationState => ({ tab: 'skills', category: 'all', selection: { kind: 'list' } }),
    actions: {
      setTab: (draft, tab) => {
        draft.tab = tab
        draft.selection = { kind: 'list' }
        draft.category = 'all'
      },
      setCategory: (draft, category) => { draft.category = category },
      openDetail: (draft, id) => { draft.selection = { kind: 'detail', id } },
      closeDetail: (draft) => { draft.selection = { kind: 'list' } },
    },
  })
}
