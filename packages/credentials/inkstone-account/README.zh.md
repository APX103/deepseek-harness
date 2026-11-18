# @deepseek-ai/dsh-inkstone-account

[English](README.md) | 中文

Inkstone（端砚）账号服务 —— [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) 里程碑 M2。

harness 的单元 SSO，从书生·端砚桌面端（`intern-inkstone`，BSD-2-Clause）抽取：用户中心信封/JWT/资料解析与 `uaa::code::` 兑换为逐字移植；uaa `byAccount` 密码流程（公钥 → RSA 密码 → `uaa::code::`）为新增，镜像 SSO 网页表单。注册留在网页端。

默认导出是 Cordis 服务类，bundle 行可直接装载；`ctx.inkstoneAccount.resolveToken()` 供给 `llm-inkstone` 路由；存在 credentials 服务时，grant 经凭据缝持久化。

```yaml
- id: inkstone-account
  name: '@deepseek-ai/dsh-inkstone-account'
  config:
    authBaseUrl: https://discovery-staging.intern-ai.org.cn/api/user-center/v1
    ssoOrigin: https://sso.staging.openxlab.org.cn
    clientId: 05wrodmwk4z3mze13kmy
    source: discovery
```

`password-login.ts` 中的 `verify-wire` 标记列出需要一次真实登录确认的载荷字段拼写（端点族与信封已于 2026-11-17 对 staging SSO bundle 验证）。
