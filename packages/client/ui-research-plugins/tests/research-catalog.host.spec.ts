// The research-catalog Remote: links resolution, the fail-soft runtime join,
// and the hub pull mechanism (KEP-0008).
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import ResearchCatalogService, { type Config } from '../src/index.ts'
import { RESEARCH_CATALOG_SCHEMA_VERSION } from '../src/hub.ts'

afterEach(() => { vi.restoreAllMocks() })

async function mount(config: Partial<Config> = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(ResearchCatalogService, ResearchCatalogService.Config(config))
  return { ctx, catalog: ctx.researchCatalog }
}

/** A JSON Response with an optional ETag. */
function json(body: unknown, etag?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...(etag !== undefined ? { etag } : {}) },
  })
}

it('resolves the production platform-web links by default', async () => {
  const { catalog } = await mount()
  expect(await catalog.links()).toEqual({
    papers: 'https://discovery.intern-ai.org.cn/paper',
    researchApps: 'https://discovery.intern-ai.org.cn/app',
  })
})

it('resolves the deployment-configured links (staging overrides through config)', async () => {
  const { catalog } = await mount({
    papersUrl: 'https://discovery-staging.intern-ai.org.cn/paper',
    researchAppsUrl: 'https://discovery-staging.intern-ai.org.cn/app',
  })
  expect(await catalog.links()).toEqual({
    papers: 'https://discovery-staging.intern-ai.org.cn/paper',
    researchApps: 'https://discovery-staging.intern-ai.org.cn/app',
  })
})

it('starts without a hub endpoint (bundled catalog only until a hub is configured)', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(ResearchCatalogService, ResearchCatalogService.Config({}))
  expect(ResearchCatalogService.Config({}).hubUrl).toBe('')
})

it('joins the bundled catalog fail-soft: absent runtimes render 未启用, not vanished rows', async () => {
  const { catalog } = await mount()
  const document = await catalog.catalog()
  // The bundled entries are always listed…
  expect(document.skills.map(row => row.entry.id)).toContain('research.skill.office')
  expect(document.agents.map(row => row.entry.id)).toContain('research.agent.cordis')
  // …but without sibling runtimes nothing claims availability.
  expect(document.skills.every(row => row.runtime.present === false)).toBe(true)
  expect(document.agents.every(row => row.runtime.present === false)).toBe(true)
  expect(document.updatedAt).not.toBe('')
})

it('marks catalogued entries 可用 and synthesizes uncatalogued runtime rows', async () => {
  const { ctx, catalog } = await mount()
  // Fake sibling runtimes: the shipped office skill plus one user-installed
  // skill; the full preset roster minus a catalogued ref.
  ctx.provide('skills', { list: async () => [
    { name: 'office', description: 'office documents' },
    { name: 'paper-digest', description: 'summarizes papers' },
  ] })
  ctx.provide('agentPresets', { list: async () => [
    { id: 'standard' }, { id: 'ptc' }, { id: 'minimal' }, { id: 'cordis' },
  ] })
  const document = await catalog.catalog()
  const office = document.skills.find(row => row.entry.ref === 'office')
  expect(office?.runtime.present).toBe(true)
  // The uncatalogued user skill joins as a runtime-sourced row.
  const synthesized = document.skills.find(row => row.entry.id === 'runtime.skill.paper-digest')
  expect(synthesized?.entry.source).toBe('runtime')
  expect(synthesized?.runtime.present).toBe(true)
  // Presets beyond the catalog's curated entry stay visible.
  expect(document.agents.map(row => row.entry.ref)).toContain('standard')
  expect(document.agents.find(row => row.entry.ref === 'cordis')?.runtime.present).toBe(true)
})

it('merges hub entries with the hub badge and drops the bundled ref duplicates', async () => {
  const fetchMock = vi.fn(async () => json({
    version: RESEARCH_CATALOG_SCHEMA_VERSION,
    entries: [
      { id: 'lit-review', kind: 'skill', ref: 'lit-review', name: '文献综述', description: '批量读取并综述文献', category: 'literature', samplePrompts: ['综述这五篇论文的方法部分'] },
      // Duplicates the bundled office ref: the curated copy must win.
      { id: 'office-dup', kind: 'skill', ref: 'office', name: '另一个办公技能', description: '重复行', category: 'office', samplePrompts: [] },
      // Unusable row: wrong kind — dropped, pull still succeeds.
      { id: 'bad', kind: 'extension', ref: 'x', name: 'x', description: 'x' },
    ],
  }, 'W/"hub-1"'))
  vi.stubGlobal('fetch', fetchMock)
  const { catalog } = await mount({ hubUrl: 'https://hub.example/research-catalog' })
  const document = await catalog.catalog()
  const litReview = document.skills.find(row => row.entry.id === 'research.hub.lit-review')
  expect(litReview?.entry.source).toBe('hub')
  expect(litReview?.entry.category).toBe('literature')
  // The curated office row survives; the hub duplicate does not.
  expect(document.skills.filter(row => row.entry.ref === 'office')).toHaveLength(1)
  expect(document.skills.find(row => row.entry.ref === 'office')?.entry.source).toBe('bundled')
  // The unusable row dropped without failing the pull.
  expect(document.skills.find(row => row.entry.id === 'research.hub.bad')).toBeUndefined()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('keeps the last good hub payload through a failed pull and revalidates with ETag', async () => {
  const fetchMock = vi.fn()
    .mockImplementationOnce(async () => json({
      version: RESEARCH_CATALOG_SCHEMA_VERSION,
      entries: [{ id: 'viz-kit', kind: 'skill', ref: 'viz-kit', name: '作图套件', description: '科研作图', category: 'viz', samplePrompts: [] }],
    }, 'W/"hub-1"'))
    // Refresh: revalidation hits the endpoint; the server answers 304.
    .mockImplementationOnce(async () => new Response(null, { status: 304, headers: { etag: 'W/"hub-1"' } }))
    // Refresh again: the network dies; the cache must survive.
    .mockRejectedValueOnce(new Error('network down'))
  vi.stubGlobal('fetch', fetchMock)
  const { catalog } = await mount({ hubUrl: 'https://hub.example/research-catalog' })
  expect((await catalog.catalog()).skills.find(row => row.entry.ref === 'viz-kit')).toBeDefined()
  // refresh() re-pulls; 304 replays the cache.
  await catalog.refresh()
  expect((await catalog.catalog()).skills.find(row => row.entry.ref === 'viz-kit')).toBeDefined()
  // refresh() through the failure keeps the last good payload.
  await catalog.refresh()
  expect((await catalog.catalog()).skills.find(row => row.entry.ref === 'viz-kit')).toBeDefined()
  // Conditional requests carried the validator.
  expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ 'if-none-match': 'W/"hub-1"' })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('rejects a hub speaking the wrong schema version and serves the bundled catalog', async () => {
  const fetchMock = vi.fn(async () => json({ version: 'research-catalog-v0', entries: [{ id: 'x', kind: 'skill', ref: 'x', name: 'x', description: 'x' }] }))
  vi.stubGlobal('fetch', fetchMock)
  const { catalog } = await mount({ hubUrl: 'https://hub.example/research-catalog' })
  const document = await catalog.catalog()
  expect(document.skills.find(row => row.entry.source === 'hub')).toBeUndefined()
  expect(document.skills.map(row => row.entry.id)).toContain('research.skill.office')
})
