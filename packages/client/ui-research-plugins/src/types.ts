/**
 * Public boundary types of the research-catalog Remote (KEP-0008). The
 * generator requires remote-boundary types on a public non-root type subpath.
 *
 * @module dsh-client-ui-research-plugins/types
 */

/** The two platform-web links the sidebar renders under the panel list. */
export interface ResearchLinks {
  /** 论文工具 destination. */
  papers: string
  /** 科研应用 destination. */
  researchApps: string
}

/** The capability kind of a catalog entry. */
export type ResearchKind = 'skill' | 'connector' | 'agent'

/**
 * The research-workflow stage a catalog entry belongs to (KEP-0008's 研究阶段
 * rail). Keys are stable; the client owns their display copy. Absent means
 * uncategorised — runtime-synthesized rows (a configured MCP server, a
 * user-installed skill) carry no stage until a catalog entry describes them.
 */
export type ResearchCategory =
  | 'literature'
  | 'topic'
  | 'data'
  | 'viz'
  | 'writing'
  | 'outreach'
  | 'office'

/** One curated research capability, keyed to a runtime object by `ref`. */
export interface ResearchCatalogEntry {
  /** Namespaced id: `research.skill.*` / `research.conn.*` / `research.agent.*` / `runtime.*`. */
  readonly id: string
  /** Which capability runtime the `ref` addresses. */
  readonly kind: ResearchKind
  /** Skill name, MCP server name, or agent-preset id at the runtime. */
  readonly ref: string
  /** Display copy (zh source of truth; catalog copy is data, not chrome). */
  readonly name: string
  /** One-line description shown on the card. */
  readonly description: string
  /** The 研究阶段 rail section; absent rows render under 未分类. */
  readonly category?: ResearchCategory
  /** Prompts the card's 去试试 copies to the clipboard. */
  readonly samplePrompts: readonly string[]
  /** Display sort weight within its kind; lower first. */
  readonly order?: number
  /** Where the entry came from: the in-repo catalog, a hub pull, or the runtime itself. */
  readonly source: 'bundled' | 'hub' | 'runtime'
}

/** What the harness runtime says about one entry's `ref`. */
export interface ResearchRuntimeState {
  /** The ref resolves at the runtime (an invocable skill, a live server, a rostered preset). */
  readonly present: boolean
  /** Runtime detail for the badge title: connection state or preset failure. */
  readonly status?: string
}

/** One card on the 科研插件 page: catalog copy joined with runtime truth. */
export interface ResearchCatalogItem {
  readonly entry: ResearchCatalogEntry
  readonly runtime: ResearchRuntimeState
}

/** The joined document behind the page's three tabs. */
export interface ResearchCatalogDocument {
  readonly skills: readonly ResearchCatalogItem[]
  readonly connectors: readonly ResearchCatalogItem[]
  readonly agents: readonly ResearchCatalogItem[]
  /** ISO timestamp of the join, for the page's staleness display. */
  readonly updatedAt: string
}
