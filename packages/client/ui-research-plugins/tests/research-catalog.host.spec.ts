// The research-catalog Remote: deployment links resolution and config defaults (KEP-0008).
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import ResearchCatalogService, { type Config } from '../src/index.ts'

afterEach(() => { vi.restoreAllMocks() })

async function mount(config: Partial<Config> = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(ResearchCatalogService, ResearchCatalogService.Config(config))
  return { ctx, catalog: ctx.researchCatalog }
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
