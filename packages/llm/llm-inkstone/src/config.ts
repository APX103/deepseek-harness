/**
 * Inkstone route configuration: the orbit gateway endpoint, the M1 manual
 * token source, the default model, and the static model catalog.
 *
 * M2 (KEP-0002) replaces `tokenEnv` with the inkstone-account credential
 * service; nothing else in this package reads authentication.
 *
 * @module dsh-llm-inkstone/config
 */
import z from '@deepseek-ai/schemastery'

/** One static catalog entry offered by the route. */
export interface InkstoneModelEntry {
  readonly id: string
  readonly name: string
  readonly contextWindow: number
  readonly maxTokens: number
}

/** Inkstone route configuration. */
export interface Config {
  /** Orbit gateway root, for example `https://discovery-staging.intern-ai.org.cn/api/orbit/v1`. */
  readonly baseURL: string
  /** Environment variable holding the bearer JWT fallback; the inkstone-account service takes precedence. */
  readonly tokenEnv: string
  /**
   * Existing orbit chat id for `/local-agent/messages`; the gateway requires a
   * pre-created local-agent chat. `0` uses a random id, which the live gateway
   * rejects with CHAT_NOT_FOUND until M2 lands chat bootstrap.
   */
  readonly chatId: number
  /** Model id sent when the caller names none; the gateway's `auto` routes by task. */
  readonly defaultModel: string
  /** Whether to request thinking output. */
  readonly thinking: boolean
  /** Thinking budget in tokens; `0` leaves the field unset. */
  readonly thinkingBudgetTokens: number
  /** Locale reported in gateway metadata. */
  readonly locale: string
  /** How long one gateway model listing stays fresh; `0` refreshes on every access. */
  readonly catalogMaxAgeMs: number
  /** Fallback catalog used before the first listing and whenever it fails. */
  readonly models: readonly InkstoneModelEntry[]
}

const modelEntry = z.object({
  id: z.string(),
  name: z.string(),
  contextWindow: z.number(),
  maxTokens: z.number(),
})

export const Config = z.object({
  baseURL: z
    .string()
    .default('https://discovery-staging.intern-ai.org.cn/api/orbit/v1'),
  tokenEnv: z.string().default('INKSTONE_JWT'),
  chatId: z.number().default(0),
  defaultModel: z.string().default('auto'),
  thinking: z.boolean().default(false),
  thinkingBudgetTokens: z.number().default(0),
  locale: z.string().default('zh-CN'),
  catalogMaxAgeMs: z.number().default(600_000),
  models: z
    .array(modelEntry)
    .default([{ id: 'auto', name: 'Inkstone Auto', contextWindow: 131072, maxTokens: 8192 }]),
})
