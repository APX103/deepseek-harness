/**
 * Research-catalog Remote (KEP-0008): the Host resolves the deployment's
 * platform-web links and the merged research catalog for the browser's
 * 科研插件 page. The join is fail-soft: bundled + hub entries whose runtime
 * ref is absent render 未启用, and runtime objects without catalog copy are
 * synthesized as `runtime.*` rows, so the page stays an honest catalog of
 * the deployment. UI copy is locale-owned on the Client; catalog copy and
 * deployment endpoints live here.
 *
 * @module dsh-client-ui-research-plugins
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BUNDLED_CATALOG } from './catalog.ts'
import { pullHub, type HubCache } from './hub.ts'
import type {
  ResearchCatalogDocument, ResearchCatalogEntry, ResearchCatalogItem, ResearchKind, ResearchLinks, ResearchRuntimeState,
} from './types.ts'

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

export type { ResearchCatalogDocument, ResearchCatalogEntry, ResearchLinks } from './types.ts'

/** The runtime views the join reads, all optional: a deployment may ship none. */
interface SkillRuntime {
  list?: () => Promise<readonly { name: string; description: string }[]>
}
interface McpRuntime {
  list?: () => readonly { name: string; configured: boolean; status: { state: string } }[]
}
interface PresetRuntime {
  list?: () => Promise<readonly { id: string; name?: string; broken?: string }[]>
}

/** Sort weight for runtime-synthesized rows: after every catalogued entry. */
const RUNTIME_ROW_ORDER = 100

/** Resolves the deployment's research links and the joined capability catalog. */
export default class ResearchCatalogService extends TypertRemoteService {
  static Config: z<Partial<Config>, Config> = z.object({
    // Production platform-web defaults (the prototype's destinations);
    // staging deployments override through their profile config.
    papersUrl: z.string().default('https://discovery.intern-ai.org.cn/paper'),
    researchAppsUrl: z.string().default('https://discovery.intern-ai.org.cn/app'),
    // No public hub exists yet: absent means bundled-catalog-only.
    hubUrl: z.string().default(''),
  })

  /** Last good hub pull, kept across failed refreshes. */
  private hubCache: HubCache | undefined
  /** In-flight pull, so concurrent catalog reads share one request. */
  private pulling: Promise<void> | undefined
  /** Whether a pull completed since the last refresh (reads reuse the cache). */
  private hubPullDone = false

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

  /**
   * The joined capability catalog behind the page's three tabs: bundled +
   * hub entries joined fail-soft against the harness runtimes, plus
   * runtime-synthesized rows for uncatalogued capabilities.
   * @returns the joined document for 技能 / 连接器 / 智能体.
   */
  @Remote
  async catalog(): Promise<ResearchCatalogDocument> {
    await this.ensureHub()
    return this.join()
  }

  /**
   * Drop nothing: re-pull with the cached validator (a 304 replays the
   * payload) and re-join. A failed pull keeps the last good payload.
   * @returns the freshly joined document.
   */
  @Remote
  async refresh(): Promise<ResearchCatalogDocument> {
    await this.ensureHub(true)
    return this.join()
  }

  /** Pull the hub once per cache lifetime (or on refresh); failures keep the last payload. */
  private ensureHub(force = false): Promise<void> {
    if (this.config.hubUrl === '') return Promise.resolve()
    if (this.pulling !== undefined) return this.pulling
    if (this.hubPullDone && !force) return Promise.resolve()
    this.pulling = pullHub(this.config.hubUrl, this.hubCache)
      .then((pull) => {
        if (pull !== undefined) this.hubCache = pull
        this.hubPullDone = true
      })
      .catch(() => { /* fail-soft: the cached (or bundled) catalog still serves */ })
      .finally(() => { this.pulling = undefined })
    return this.pulling
  }

  /**
   * Merge bundled + hub entries with the harness runtimes. Every runtime
   * read is defensive: a deployment without a capability runtime yields
   * empty views, and its catalogued entries render 未启用 rather than
   * vanishing.
   * @returns the joined document.
   */
  private async join(): Promise<ResearchCatalogDocument> {
    const [skillViews, serverViews, presetViews] = await Promise.all([
      this.readSkills(), this.readServers(), this.readPresets(),
    ])
    const catalogued: readonly ResearchCatalogEntry[] = [
      ...BUNDLED_CATALOG,
      // Hub rows merge under their own source badge; a hub row duplicating a
      // bundled ref drops — the curated copy wins, namespaces stay distinct.
      ...(this.hubCache?.entries ?? []).filter(hubEntry =>
        !BUNDLED_CATALOG.some(bundled => bundled.kind === hubEntry.kind && bundled.ref === hubEntry.ref)),
    ]

    const cataloguedRefs = (kind: ResearchKind): Set<string> =>
      new Set(catalogued.filter(entry => entry.kind === kind).map(entry => entry.ref))

    // Skills: a catalogued entry is present when the runtime lists its name.
    const skillRefs = cataloguedRefs('skill')
    const skills = [
      ...catalogued.filter(entry => entry.kind === 'skill').map(entry => ({
        entry,
        runtime: this.state(skillViews.has(entry.ref)),
      })),
      // Uncatalogued runtime skills (project / custom directories) still belong on the page.
      ...[...skillViews.entries()]
        .filter(([name]) => !skillRefs.has(name))
        .map(([name, description]) => ({
          entry: this.runtimeRow('skill', name, name, description),
          runtime: this.state(true),
        })),
    ]

    // Connectors: configured MCP servers; disabled or removed ones are 未启用.
    const connectorRefs = cataloguedRefs('connector')
    const connectors = [
      ...catalogued.filter(entry => entry.kind === 'connector').map((entry) => {
        const view = serverViews.get(entry.ref)
        const present = view !== undefined && view.configured && view.state !== 'disabled'
        return { entry, runtime: this.state(present, view?.state) }
      }),
      ...[...serverViews.entries()]
        .filter(([name]) => !connectorRefs.has(name))
        .map(([name, view]) => ({
          entry: this.runtimeRow('connector', name, name),
          runtime: this.state(view.configured && view.state !== 'disabled', view.state),
        })),
    ]

    // Agents: rostered presets; a broken activation reports the failure.
    const agentRefs = cataloguedRefs('agent')
    const agents = [
      ...catalogued.filter(entry => entry.kind === 'agent').map((entry) => {
        const preset = presetViews.get(entry.ref)
        return {
          entry,
          runtime: this.state(preset !== undefined && preset.broken === undefined, preset?.broken),
        }
      }),
      ...[...presetViews.entries()]
        .filter(([id]) => !agentRefs.has(id))
        .map(([id, preset]) => ({
          entry: this.runtimeRow('agent', id, preset.name ?? id),
          runtime: this.state(preset.broken === undefined, preset.broken),
        })),
    ]

    const byOrder = (a: ResearchCatalogItem, b: ResearchCatalogItem): number =>
      (a.entry.order ?? RUNTIME_ROW_ORDER) - (b.entry.order ?? RUNTIME_ROW_ORDER)
      || a.entry.name.localeCompare(b.entry.name, 'zh')

    return {
      skills: [...skills].sort(byOrder),
      connectors: [...connectors].sort(byOrder),
      agents: [...agents].sort(byOrder),
      updatedAt: new Date().toISOString(),
    }
  }

  /**
   * A runtime verdict for one entry. `status` rides along whenever the
   * runtime said anything — connection state for a present connector, the
   * broken reason for an absent preset — and the client decides display.
   */
  private state(present: boolean, status?: string): ResearchRuntimeState {
    return { present, ...(status !== undefined ? { status } : {}) }
  }

  /** A row for a runtime capability no catalog entry describes. */
  private runtimeRow(kind: ResearchKind, ref: string, name: string, description = ''): ResearchCatalogEntry {
    return {
      id: `runtime.${kind}.${ref}`,
      kind,
      ref,
      name,
      description,
      samplePrompts: [],
      order: RUNTIME_ROW_ORDER,
      source: 'runtime',
    }
  }

  /** Read the skill runtime defensively; a deployment without it yields an empty view. */
  private async readSkills(): Promise<Map<string, string>> {
    const registry = this.ctx.get('skills') as SkillRuntime | undefined
    try {
      const rows = await registry?.list?.() ?? []
      return new Map(rows.map(row => [row.name, row.description]))
    } catch {
      return new Map()
    }
  }

  /** Read the MCP manager defensively; a deployment without it yields an empty view. */
  private readServers(): Map<string, { configured: boolean; state: string }> {
    const manager = this.ctx.get('mcpManager') as McpRuntime | undefined
    try {
      const views = manager?.list?.() ?? []
      return new Map(views.map(view => [view.name, { configured: view.configured, state: view.status.state }]))
    } catch {
      return new Map()
    }
  }

  /** Read the agent-preset roster defensively; a deployment without it yields an empty view. */
  private async readPresets(): Promise<Map<string, { name?: string | undefined; broken?: string | undefined }>> {
    const registry = this.ctx.get('agentPresets') as PresetRuntime | undefined
    try {
      const rows = await registry?.list?.() ?? []
      return new Map(rows.map(row => [row.id, { name: row.name, broken: row.broken }]))
    } catch {
      return new Map()
    }
  }
}
