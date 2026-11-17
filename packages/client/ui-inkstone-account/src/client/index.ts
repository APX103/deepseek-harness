/**
 * The Inkstone sign-in surface, browser half: a full-screen 登录 gate over
 * the injected session endpoint (KEP-0002 D10). Renders only while the
 * inkstone-account session is unauthenticated; a successful sign-in reloads
 * the page into the signed-in client. Registration stays on the web.
 *
 * @module dsh-client-ui-inkstone-account/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { inkstoneAccountGlobal } from '../global.ts'

export const inject: readonly string[] = []

interface SessionResponse {
  readonly authenticated?: boolean
  readonly user?: { readonly username?: string }
  readonly code?: string
  readonly message?: string
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  void ctx
  const endpoint = inkstoneAccountGlobal()
  if (endpoint === undefined) return () => Promise.resolve()
  let session: SessionResponse
  try {
    const response = await fetch(`${endpoint.baseUrl}/session`, { headers: { accept: 'application/json' } })
    session = (await response.json()) as SessionResponse
  } catch {
    // Without a reachable endpoint the client stays as the host composed it.
    return () => Promise.resolve()
  }
  if (session.authenticated === true) return () => Promise.resolve()
  const teardown = mountGate(endpoint.baseUrl, endpoint.registerUrl)
  return () => {
    teardown()
    return Promise.resolve()
  }
}

function errorMessage(failure: SessionResponse): string {
  if (failure.code === 'AUTH_CAPTCHA_REQUIRED') return '触发人机验证：请先在网页端登录一次，再回到这里重试'
  if (failure.code === 'AUTH_REJECTED') return '账号或密码错误'
  if (failure.code === 'AUTH_NETWORK') return '网络异常，请稍后重试'
  return failure.message && failure.message !== '' ? failure.message : '登录失败，请重试'
}

function mountGate(baseUrl: string, registerUrl: string): () => void {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-inkstone-login', '')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:radial-gradient(1200px 600px at 20% -10%, #2c3e67 0%, #141b2d 55%, #0d1220 100%)',
    'font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif',
  ].join(';')

  const card = document.createElement('div')
  card.style.cssText = [
    'width:340px',
    'padding:36px 32px 28px',
    'border-radius:16px',
    'background:#ffffff',
    'box-shadow:0 24px 64px rgba(6,10,20,.45)',
    'text-align:center',
  ].join(';')

  const mark = document.createElement('div')
  mark.textContent = '端砚'
  mark.style.cssText = ['width:56px', 'height:56px', 'margin:0 auto 14px', 'border-radius:14px', 'line-height:56px', 'font-size:22px', 'color:#f5f1e6', 'background:linear-gradient(135deg,#2f3b52,#111722)'].join(';')

  const title = document.createElement('h1')
  title.textContent = '端砚 Inkstone'
  title.style.cssText = ['margin:0 0 6px', 'font-size:22px', 'color:#17202f'].join(';')

  const subtitle = document.createElement('p')
  subtitle.textContent = '上海人工智能实验室 · 书生生态'
  subtitle.style.cssText = ['margin:0 0 24px', 'font-size:13px', 'color:#7a8496'].join(';')

  const username = document.createElement('input')
  username.type = 'text'
  username.placeholder = '账号（邮箱 / 手机号 / 用户名）'
  username.autocomplete = 'username'
  username.style.cssText = inputStyle()

  const password = document.createElement('input')
  password.type = 'password'
  password.placeholder = '密码'
  password.autocomplete = 'current-password'
  password.style.cssText = inputStyle('margin-top:10px')

  const error = document.createElement('p')
  error.setAttribute('role', 'alert')
  error.style.cssText = ['min-height:18px', 'margin:12px 0 0', 'font-size:12px', 'color:#c0392b'].join(';')

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = '登 录'
  submit.style.cssText = [
    'margin-top:18px',
    'width:100%',
    'padding:10px 0',
    'border:none',
    'border-radius:8px',
    'background:#1f2b45',
    'color:#f5f1e6',
    'font-size:15px',
    'cursor:pointer',
  ].join(';')

  const register = document.createElement('p')
  register.style.cssText = ['margin:14px 0 0', 'font-size:12px', 'color:#98a1b3'].join(';')
  register.textContent = '还没有账号？'
  if (registerUrl !== '') {
    const link = document.createElement('a')
    link.href = registerUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = '去网页注册'
    link.style.color = '#2f5cc4'
    register.appendChild(link)
  }

  const form = document.createElement('form')
  form.append(username, password, error, submit, register)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void signIn()
  })

  card.append(mark, title, subtitle, form)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  async function signIn(): Promise<void> {
    const name = username.value.trim()
    if (name === '' || password.value === '') {
      error.textContent = '请输入账号和密码'
      return
    }
    submit.disabled = true
    submit.textContent = '登录中…'
    error.textContent = ''
    try {
      const response = await fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: name, password: password.value }),
      })
      const body = (await response.json().catch(() => ({}))) as SessionResponse
      if (response.ok && body.authenticated === true) {
        window.location.reload()
        return
      }
      error.textContent = errorMessage(body)
    } catch {
      error.textContent = '网络异常，请稍后重试'
    }
    submit.disabled = false
    submit.textContent = '登 录'
  }

  return () => {
    overlay.remove()
  }
}

function inputStyle(extra = ''): string {
  return [
    'width:100%',
    'box-sizing:border-box',
    'padding:10px 12px',
    'border:1px solid #d6dbe4',
    'border-radius:8px',
    'font-size:14px',
    'outline:none',
    extra,
  ]
    .filter(part => part !== '')
    .join(';')
}
