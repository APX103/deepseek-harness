# @deepseek-ai/dsh-inkstone-account

Inkstone (端砚) account service — [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) milestone M2.

Unit SSO for the harness, extracted from the 书生·端砚 desktop (`intern-inkstone`,
BSD-2-Clause): the user-center envelope/JWT/profile parsing and the `uaa::code::`
exchange are ported verbatim; the uaa `byAccount` password flow (public key → RSA
password → `uaa::code::`) is new and mirrors the SSO web form. Registration stays
on the web.

The default export is the Cordis service class, so a bundle row loads it
directly; `ctx.inkstoneAccount.resolveToken()` feeds the `llm-inkstone` route,
and the grant persists through the credentials seam when one is present.

```yaml
- id: inkstone-account
  name: '@deepseek-ai/dsh-inkstone-account'
  config:
    authBaseUrl: https://discovery-staging.intern-ai.org.cn/api/user-center/v1
    ssoOrigin: https://sso.staging.openxlab.org.cn
    clientId: 05wrodmwk4z3mze13kmy
    source: discovery
```

`verify-wire` markers in `password-login.ts` name the payload field spellings
that need one live sign-in to confirm (endpoint family and envelope are verified
against the staging SSO bundle, 2026-11-17).
