/**
 * The Inkstone sign-in surface, host half: a loopback-only session endpoint
 * over the inkstone-account service, announced to pages through the web
 * server's index-injection table (KEP-0002 D10).
 *
 * The endpoint binds 127.0.0.1 on an OS-assigned port under an unguessable
 * path token; the injected `INKSTONE_ACCOUNT` global carries `{ baseUrl,
 * registerUrl }` for the client gate in `./client`. This replaces every
 * upstream DeepSeek account surface in the composition.
 *
 * @module dsh-client-ui-inkstone-account
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-inkstone-account'
import { Config } from './config.ts'
import { INKSTONE_ACCOUNT_GLOBAL } from './global.ts'

export { Config } from './config.ts'
export type { Config as InkstoneAccountUiConfig } from './config.ts'
export { INKSTONE_ACCOUNT_GLOBAL } from './global.ts'

export const name = 'ui-inkstone-account'
export const inject = ['inkstoneAccount', 'webServer']

const MAX_BODY_BYTES = 16 * 1024

export function apply(ctx: Context, config: Config): void {
  const pathToken = randomBytes(24).toString('hex')
  const server = createServer((request, response) => {
    void handleSessionRequest(ctx, config, pathToken, request, response)
  })
  // The bind races the first index-inject emit, so the port is cached once
  // listening and every later emit uses the settled value.
  let boundPort: number | undefined
  server.on('listening', () => {
    const address = server.address()
    if (address !== null && typeof address !== 'string') boundPort = address.port
  })
  server.listen(0, '127.0.0.1')
  ctx.on('webserver/index-inject', (table) => {
    if (boundPort === undefined) return
    table.push({
      kind: 'global',
      name: INKSTONE_ACCOUNT_GLOBAL,
      value: {
        baseUrl: `http://127.0.0.1:${boundPort}/${pathToken}`,
        registerUrl: config.registerUrl,
      },
    })
  })
  ctx.effect(() => () => {
    server.close()
  })
}

async function handleSessionRequest(
  ctx: Context,
  config: ReturnType<typeof Config>,
  pathToken: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCorsHeaders(response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== `/${pathToken}/session`) {
    response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
    return
  }
  try {
    if (request.method === 'GET') {
      const state = ctx.inkstoneAccount.state()
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ authenticated: state.authenticated, user: state.user, expiresAtMs: state.expiresAtMs }),
      )
      return
    }
    if (request.method === 'DELETE') {
      await ctx.inkstoneAccount.signOut()
      response.writeHead(204).end()
      return
    }
    if (request.method === 'POST') {
      const body = await readJsonBody(request)
      const username = typeof body['username'] === 'string' ? body['username'].trim() : ''
      const password = typeof body['password'] === 'string' ? body['password'] : ''
      if (username === '' || password === '') {
        response.writeHead(400, { 'content-type': 'application/json' }).end('{"code":"BAD_REQUEST","message":"账号和密码不能为空"}')
        return
      }
      const view = await ctx.inkstoneAccount.signInWithPassword(username, password)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ authenticated: true, user: view.user, expiresAtMs: view.expiresAtMs, registerUrl: config.registerUrl }),
      )
      return
    }
    response.writeHead(405, { 'content-type': 'application/json' }).end('{"error":"method not allowed"}')
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'AUTH_REJECTED'
    const message = error instanceof Error ? error.message : '登录失败'
    const status = code.startsWith('AUTH_') ? 401 : 500
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ code, message }))
  }
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be an object')
  }
  return parsed as Record<string, unknown>
}
