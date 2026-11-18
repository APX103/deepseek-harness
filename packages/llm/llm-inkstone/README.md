# @deepseek-ai/dsh-llm-inkstone

English | [中文](README.zh.md)

Inkstone (端砚) cloud-gateway provider for the harness LLM seam — [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) milestone M1.

One harness model call becomes one v2.0 **detached** inference on the orbit gateway
(`POST {baseURL}/local-agent/messages`) with `Authorization: Bearer <JWT>`, harness
attribution headers, and the gateway's SSE event vocabulary mapped onto stream chunks.
Token Plan business codes (`403005`, `429004`, `429005`) surface as `TOKEN_PLAN_REJECTED`
and never carry retry authority.

Authentication is login-gated through the inkstone-account service (no environment
fallback); the inkstone-token-plan package adds the 墨点 balance surface. Custom
providers may coexist via the pi-ai adapter (KEP-0006).

```yaml
- id: llm-inkstone
  name: '@deepseek-ai/dsh-llm-inkstone'
  config:
    baseURL: https://discovery-staging.intern-ai.org.cn/api/orbit/v1
    models:
      - id: auto
        name: Inkstone Auto
        contextWindow: 131072
        maxTokens: 8192
```
