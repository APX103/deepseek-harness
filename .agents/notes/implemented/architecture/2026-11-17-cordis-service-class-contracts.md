# Agent Note: Cordis service classes and the Inkstone gateway wire contract

Status: implemented

English | [中文](2026-11-17-cordis-service-class-contracts.zh.md)

## Problem

The Inkstone live integration (KEP-0002/0003) failed only in the real cordis composition while every unit test passed, and the Inkstone staging gateway rejected inference requests with four successive 422 envelopes. Unit tests construct services directly or over fake contexts, so they exercise none of the mechanics the composition actually runs: the service proxy, the class-plugin config schema, the loader entrypoint choice, cross-fiber activation order, or the deployed gateway's field validation. Two questions needed durable answers: what a `Service` subclass must look like to survive cordis machinery, and how a harness validates a closed external gateway contract it cannot read the source of.

## Decision

A `Service` subclass ships under three hard contracts, each learned from a live-only failure:

- **TypeScript `private`, never ECMAScript `#`.** Cordis wraps service instances in a traceable proxy and replaces the receiver with a shadow context when a method is called through `ctx.<service>`; a proxy never passes the `#` brand check, so any method touching a `#` field throws "Cannot read private member". This is why no other `Service` subclass in the repository uses `#` fields. `InkstoneAccount` and `InkstoneTokenPlan` were the two that did ([fix commit ac469c4976](https://github.com/APX103/deepseek-harness/commit/ac469c4976)).
- **`static Config = Config` on every class plugin.** The loader instantiates a default-exported class with `(ctx, config)`; without the static schema the schemastery defaults never resolve and the constructor receives `undefined`, which fails later at first field access rather than at load. A module `apply` function in the same file does not run: `vendor/loader` `unwrapExports()` prefers `export default` over the named `apply`, so a package must treat its default export as the real entrypoint and wire dependencies in the class constructor (lazily, via `ctx.get`), not in a side `apply`.
- **Cross-fiber reads follow activation, not construction.** A service constructor that snapshots another service (`ctx.get('credentials')`) or fires one-shot work against it races that fiber's asynchronous init (`Service.init`); `readRecord`-style snapshot reads return empty until the provider finishes loading. One-shot restore at construction silently loses. The account grant restore is therefore a serialized chain that re-runs on the `internal/service` event for `credentials` — which fires exactly when that fiber turns ACTIVE — and every token-reading method awaits the chain.

Gateway contract validation uses a standalone repro script against staging with a real bearer token: replay `POST /chat/new` and `POST /local-agent/messages`, read the rejection envelope verbatim, fix one field, repeat. The four verified layers, now recorded in `packages/llm/llm-inkstone/src/protocol.ts` JSDoc: every JSON route answers in a `{code, msg, trace_id, data}` envelope; detached inference requires a concrete model (the `auto` alias resolves through the catalog's `canonical_id`); `metadata.locale` accepts only `zh`/`en`; and every `tool_result` content block carries a required `is_error` boolean. `Accept` must be exactly `text/event-stream`.

## Alternatives considered

**Keep ECMAScript `#` fields and unwrap the proxy at call sites.** `ctx.get(name, strict)` also returns the traceable proxy, and there is no supported unwrapped accessor; fighting the proxy at every consumer is strictly more code than using compile-time visibility.

**Declare required `inject` to sequence the credentials fiber.** Required inject makes the credentials provider mandatory, breaking compositions that run the account service without persistence, and optional inject still does not gate on the provider's init completing. The `internal/service` re-restore keeps persistence optional while closing the race for compositions that provide it.

**Read the gateway schema from the Go core checkout instead of replaying.** The checked-in core schema is newer than the deployed service (it already carries fields the deployment rejects), so the core's validation is a hint, not the contract. The envelope from the deployed gateway is the only authoritative source, and it is cheaper to replay than to mirror.

## Consequences

Every future `Service` subclass follows the three contracts by construction, and the two host specs (`packages/credentials/inkstone-account/tests/service.host.spec.ts`, `packages/inkstone/token-plan/tests/service.host.spec.ts`) bind them: each boots a real `Context` and calls the service through the `ctx.<name>` proxy, which fails on any regression to `#` fields. Gateway wire changes replay through the repro before product code moves. The cost is two contracts that look redundant from inside a package (the `static Config` line, the TS-only privacy) and stay load-bearing only in the composition.
