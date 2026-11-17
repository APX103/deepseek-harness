# @deepseek-ai/dsh-client-ui-inkstone-account

Inkstone (端砚) sign-in surface — [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) decision D10.

Replaces every upstream DeepSeek account surface in the composition:

- **Host half** (`src/index.ts`): a loopback-only session endpoint
  (`GET/POST/DELETE /<token>/session`) over `ctx.inkstoneAccount`, bound to
  `127.0.0.1` on an OS-assigned port under an unguessable path token, announced
  to pages through the web server's index-injection table as the
  `INKSTONE_ACCOUNT` global (`{ baseUrl, registerUrl }`).
- **Client half** (`src/client/index.ts`): a full-screen branded 登录 gate
  (端砚 Inkstone · 上海人工智能实验室) rendered while the session is
  unauthenticated; a successful password sign-in reloads the page. Registration
  stays on the web (`registerUrl`).

```yaml
- id: ui-inkstone-account
  name: '@deepseek-ai/dsh-client-ui-inkstone-account'
  config:
    registerUrl: https://discovery-staging.intern-ai.org.cn
```
