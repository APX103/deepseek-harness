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
