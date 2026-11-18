# Agent Note: Inkstone is the product; DeepSeek Harness is its runtime

Status: implemented

English | [中文](2026-11-18-inkstone-product-dsh-runtime-lineage.zh.md)

## Problem

The fork carries two names: the repository and its runtime vocabulary are DeepSeek Harness (DSH) — `dsh-*` packages, `DSH_*` environment variables, Cordis machinery — while the shipped product is 端砚 Inkstone by Shanghai AI Laboratory. Surfaces that speak to the model or the user drifted between the two names: the agent answered "I am DSH" from its own knowledge skill while the system prompt, sidebar, and login gate said Inkstone. Each surface that needed the fact re-derived it, and re-derivation produced the contradiction live.

## Decision

The relationship is declared, not discovered: **Inkstone is the product; DeepSeek Harness is the agent runtime it is built on.** Every identity-bearing surface states it the same way, and every surface cites this note instead of re-deriving.

- Model identity (KEP-0002, `dsh-system-prompt` `identity` config): "You are 端砚 Inkstone, an AI agent by Shanghai AI Laboratory (上海人工智能实验室)." The base bundle sets it; the web-app layer restates it because a loader patch replaces a row's whole config.
- Self-knowledge (KEP-0004): the `inkstone-doc` skill (renamed from `dsh-doc`) opens with a Who-you-are section carrying this declaration, notes the former name once for operator transition, and teaches that `dsh-*` names are runtime vocabulary to keep verbatim in technical answers.
- Runtime prose stays brand-neutral where the brand adds nothing ("Current file policy", "the file sandbox"); it stays factual where the name is a real artifact (`$DSH_*` variables, package names).
- The product never hides the lineage and never claims the runtime's name: answers to "what are you" name Inkstone first and may mention the DSH foundation; answers about internals use DSH terms as-is.

## Alternatives considered

**Erase DSH from model-facing text entirely.** Contradicts the installed reality — packages, tools, and environment variables carry `dsh` names, and pretending otherwise produces answers that mismatch what the user sees on disk.

**Keep DSH as the model-facing identity.** Contradicts the trademark and every other product surface; live sessions showed the model introducing itself as the old product.

**Per-surface wording without a shared declaration.** This was the pre-KEP-0004 state: each surface re-derived the relationship and they contradicted each other in front of the user.

## Consequences

Identity changes are now two-site edits by construction — the system-prompt config and the skill's Who-you-are section — plus this note, and the skills spec asserts the skill body renders the renamed identity. The lineage declaration is stable product copy; changing it (for example dropping the DSH mention) is a product decision recorded here first.

## Testing

`packages/preset/agent-preset/tests/skills.spec.ts` binds the skill name, the packaged body, and the repository-skill link; the KEP-0004 manual verification asks the running agent both "你是谁" and "你和 DeepSeek Harness 是什么关系" and expects the declared answers.
