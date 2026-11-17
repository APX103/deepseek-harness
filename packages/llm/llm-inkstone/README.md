# @deepseek-ai/dsh-llm-inkstone

Inkstone (端砚) cloud-gateway provider for the harness LLM seam — [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) milestone M1.

One harness model call becomes one v2.0 **detached** inference on the orbit gateway
(`POST {baseURL}/local-agent/messages`) with `Authorization: Bearer <JWT>`, harness
attribution headers, and the gateway's SSE event vocabulary mapped onto stream chunks.
Token Plan business codes (`403005`, `429004`, `429005`) surface as `TOKEN_PLAN_REJECTED`
and never carry retry authority.

M1 authentication reads the JWT from `tokenEnv` (`INKSTONE_JWT` by default). M2 replaces
it with the inkstone-account credential service; M3 adds the Token Plan balance surface.

```yaml
- id: llm-inkstone
  name: '@deepseek-ai/dsh-llm-inkstone'
  config:
    baseURL: https://discovery-staging.intern-ai.org.cn/api/orbit/v1
    tokenEnv: INKSTONE_JWT
    models:
      - id: auto
        name: Inkstone Auto
        contextWindow: 131072
        maxTokens: 8192
```
