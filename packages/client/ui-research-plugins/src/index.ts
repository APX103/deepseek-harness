/**
 * Research-catalog Remote (KEP-0008): the Host resolves the deployment's
 * platform-web links and later the merged research catalog for the browser's
 * 科研插件 page. Copy is locale-owned on the Client; the Host carries only
 * deployment endpoints.
 *
 * @module dsh-client-ui-research-plugins
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ResearchLinks } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchCatalog: ResearchCatalogService
  }
}

/** Deployment endpoints the 科研插件 page reads. */
export interface Config {
  /** The 论文工具 platform-web page; staging deployments point at the staging origin. */
  papersUrl: string
  /** The 科研应用 platform-web page; staging deployments point at the staging origin. */
  researchAppsUrl: string
  /** The remote research-catalog endpoint (research-catalog-v1); empty = bundled catalog only. */
  hubUrl: string
}

export type { ResearchLinks } from './types.ts'

/** Resolves the deployment's research links (catalog merge lands with the page, KEP-0008). */
export default class ResearchCatalogService extends TypertRemoteService {
  static Config: z<Partial<Config>, Config> = z.object({
    // Production platform-web defaults (the prototype's destinations);
    // staging deployments override through their profile config.
    papersUrl: z.string().default('https://discovery.intern-ai.org.cn/paper'),
    researchAppsUrl: z.string().default('https://discovery.intern-ai.org.cn/app'),
    // No public hub exists yet: absent means bundled-catalog-only.
    hubUrl: z.string().default(''),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'researchCatalog')
  }

  /**
   * The platform-web links for the sidebar's external rows.
   * @returns the deployment-resolved 论文工具 / 科研应用 destinations.
   */
  @Remote
  async links(): Promise<ResearchLinks> {
    return { papers: this.config.papersUrl, researchApps: this.config.researchAppsUrl }
  }
}
