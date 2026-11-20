/**
 * The bundled curated catalog (KEP-0008): what this harness ships, described
 * for the 科研插件 page. Entries reference runtime objects by name and the
 * join decides 可用/未启用 — an entry whose ref is absent renders 未启用,
 * never silently vanishes. Runtime objects without a catalog entry are
 * synthesized as `runtime.*` rows by the service, so the page stays an
 * honest catalog of the deployment. Copy is zh (catalog copy is data, not
 * UI chrome); the 研究阶段 keys translate on the client.
 *
 * @module dsh-client-ui-research-plugins/catalog
 */
import type { ResearchCatalogEntry } from './types.ts'

/** The in-repo catalog. Deliberately small: the hub pull and user-installed capabilities flesh it out. */
export const BUNDLED_CATALOG: readonly ResearchCatalogEntry[] = [
  {
    id: 'research.skill.office',
    kind: 'skill',
    // The skill runtime's name for the office suite in this deployment — the
    // join keys on it, so the ref must match the roster, not the package id.
    ref: 'office',
    name: '办公套件',
    description: '读取与生成文档、表格、演示文稿，把实验记录整理成周报、把数据表转成汇报大纲。',
    category: 'office',
    samplePrompts: [
      '把这份实验记录整理成一份周报文档',
      '把这组实验数据导出为演示文稿大纲',
    ],
    order: 10,
    source: 'bundled',
  },
  {
    id: 'research.agent.cordis',
    kind: 'agent',
    ref: 'cordis',
    name: 'Cordis 多智能体',
    description: '多智能体协作模式：拆解科研任务、并行检索与计算、汇总成结构化结论。',
    category: 'data',
    samplePrompts: [
      '帮我拆解这个课题的文献调研任务，分给多个智能体并行完成',
      '用多智能体模式复现这篇论文的核心实验',
    ],
    order: 10,
    source: 'bundled',
  },
]
