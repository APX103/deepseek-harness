/**
 * Orbit gateway inference protocol: request assembly and SSE event parsing
 * for `POST {baseURL}/local-agent/messages`.
 *
 * The wire contract mirrors the Go definition `GatewayInferenceStartRequest`
 * (intern-inkstone `core/internal/agentrpc/gateway.go`) and the gateway's
 * validated SSE event vocabulary (`message_start`, `thinking_delta`,
 * `content_delta`, `tool_use_start`, `tool_input_delta`, `tool_use_end`,
 * `usage`, `message_end`, `error`). The harness side is stateless per call,
 * so every request is a v2.0 detached inference owned by `independent`.
 *
 * @module dsh-llm-inkstone/protocol
 */
import { randomUUID } from 'node:crypto'
import { APP_IDENTITY } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm'
import type { Config } from './config.ts'

export const INFERENCE_PROTOCOL_VERSION = '2.0'

/** One raw orbit content block; the server treats blocks as opaque JSON. */
export interface OrbitContentBlock {
  readonly type: string
  readonly [field: string]: unknown
}

/** One orbit conversation message. */
export interface OrbitMessage {
  readonly role: string
  readonly content: readonly OrbitContentBlock[]
}

/** One orbit tool declaration. */
export interface OrbitTool {
  readonly name: string
  readonly description: string
  readonly input_schema: Record<string, unknown>
}

/**
 * The inference start request; identity fields follow the v2.0 detached scope.
 *
 * Field notes verified against the deployed staging gateway (2026-11-17):
 * identifiers are bare lowercase UUIDs — no `req_`/`inf_` prefixes — and the
 * deployed schema has no `lifecycle_owner` field (the checked-in Go core
 * schema is newer than the service). `chat_id` must reference an existing
 * chat, which the M2 account package creates.
 */
export interface OrbitInferenceRequest {
  readonly protocol_version: typeof INFERENCE_PROTOCOL_VERSION
  readonly request_id: string
  readonly chat_id: number
  readonly inference_kind: 'detached'
  readonly inference_id: string
  readonly model: string
  readonly thinking: { readonly enabled: boolean; readonly budget_tokens?: number }
  readonly system: readonly string[]
  readonly messages: readonly OrbitMessage[]
  readonly tools: readonly OrbitTool[]
  readonly tool_choice: { readonly type: string }
  readonly max_output_tokens?: number
  readonly metadata: { readonly locale: string; readonly client_version: string }
}

/** One parsed SSE event from the inference stream; fields are read per `type`. */
export interface OrbitSseEvent {
  readonly type: string
  readonly text?: string
  readonly id?: string
  readonly name?: string
  readonly partial_json?: string
  readonly input?: unknown
  readonly usage?: Record<string, unknown>
  readonly stop_reason?: string
  readonly code?: string | number
  readonly message?: string
  readonly retryable?: boolean
  readonly response_id?: string
  readonly model?: string
  readonly [field: string]: unknown
}

/** Fresh detached-scope identity for one inference call; the gateway wants bare lowercase UUIDs. */
export function newInferenceIds(): { requestId: string; inferenceId: string } {
  return { requestId: randomUUID(), inferenceId: randomUUID() }
}

function textBlocks(content: unknown): readonly ContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content as readonly ContentBlock[]
}

function joinedText(content: unknown): string {
  return textBlocks(content)
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function toolCallIdOf(message: RequestMessage): string {
  const source = (message as { source?: { kind?: string; callId?: unknown } }).source
  return source?.kind === 'tool' && typeof source.callId === 'string' ? source.callId : ''
}

/** Project one harness content block onto the orbit wire; M1 carries text and tool use only. */
function mapBlock(block: ContentBlock): OrbitContentBlock | undefined {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'tool-call': {
      let input: unknown = {}
      try {
        input = JSON.parse(block.arguments) as unknown
      } catch {
        input = {}
      }
      return { type: 'tool_use', id: block.id, name: block.name, input }
    }
    case 'image':
    case 'file':
      // Attachment transport arrives with the credential service (M2) and
      // gateway file slots; requests must stay valid, so they degrade to text.
      return { type: 'text', text: `[inkstone: ${block.type} attachment pending (KEP-0002 M2)]` }
    default:
      // Reasoning history, tool-addition and tool-removal blocks carry no
      // orbit wire meaning in M1.
      return undefined
  }
}

/** Assemble one detached inference request from a fully-built harness call. */
export function assembleInferenceRequest(
  options: GenerateOptions,
  config: Config,
  ids: { requestId: string; inferenceId: string; chatId: number },
): OrbitInferenceRequest {
  const system: string[] = []
  if (options.system !== undefined && options.system !== '') system.push(options.system)
  const messages: OrbitMessage[] = []
  for (const message of options.messages) {
    const role = (message as { role?: string }).role
    if (role === 'system' || role === 'developer') {
      const text = joinedText((message as { content?: unknown }).content)
      if (text !== '') system.push(text)
      continue
    }
    if (role === 'tool') {
      const callId = toolCallIdOf(message)
      const text = joinedText((message as { content?: unknown }).content)
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: callId, content: text }],
      })
      continue
    }
    const content = textBlocks((message as { content?: unknown }).content)
      .map(mapBlock)
      .filter((block): block is OrbitContentBlock => block !== undefined)
    messages.push({ role: role === 'assistant' ? 'assistant' : 'user', content })
  }
  const tools: OrbitTool[] = (options.tools ?? []).map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
  const thinking: OrbitInferenceRequest['thinking'] = config.thinking
    ? config.thinkingBudgetTokens > 0
      ? { enabled: true, budget_tokens: config.thinkingBudgetTokens }
      : { enabled: true }
    : { enabled: false }
  const request: OrbitInferenceRequest = {
    protocol_version: INFERENCE_PROTOCOL_VERSION,
    request_id: ids.requestId,
    chat_id: ids.chatId,
    inference_kind: 'detached',
    inference_id: ids.inferenceId,
    model: options.model !== '' ? options.model : config.defaultModel,
    thinking,
    system,
    messages,
    tools,
    tool_choice: { type: tools.length > 0 ? 'auto' : 'none' },
    metadata: { locale: config.locale, client_version: APP_IDENTITY.version },
  }
  if (options.maxTokens !== undefined && options.maxTokens > 0) {
    return { ...request, max_output_tokens: options.maxTokens }
  }
  return request
}

const FRAME_BOUNDARY = /(?:\r\n\r\n|\n\n)/

/** Parse one SSE frame's `data` payload into an event; comments and blanks yield nothing. */
function parseSseFrame(frame: string): OrbitSseEvent | undefined {
  let data = ''
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('data:')) data += (data === '' ? '' : '\n') + line.slice(5).replace(/^ /, '')
  }
  if (data === '' || data === '[DONE]') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
    return undefined
  }
  return parsed as OrbitSseEvent
}

/** Read the inference SSE body as parsed events, releasing the reader on exit. */
export async function* readOrbitSse(body: ReadableStream<Uint8Array>): AsyncGenerator<OrbitSseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const boundary = FRAME_BOUNDARY.exec(buffer)
        if (boundary === null) break
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const event = parseSseFrame(frame)
        if (event !== undefined) yield event
      }
    }
    buffer += decoder.decode()
    const event = parseSseFrame(buffer)
    if (event !== undefined) yield event
  } finally {
    reader.releaseLock()
  }
}
