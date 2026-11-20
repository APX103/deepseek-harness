---
description: "Surface the research capabilities in Web: the sidebar's 科研插件 catalog page (skills, connectors, agents) beside the platform-web links 论文工具 / 科研应用."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-research-plugins

English | [中文](README.zh.md)

## Summary

Surface the research capabilities in Web: the sidebar's 科研插件 catalog page (skills, connectors, agents) beside the platform-web links 论文工具 / 科研应用.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)

-----

<a id="use-this-package"></a>
## Use this package

The Host service resolves the deployment's platform-web URLs; staging and production deployments override them through profile config. The sidebar renders the two external rows from the `sidebar.nav.links` registrations — the destination rides the entry `inject` face, since the slot ledger projects options onto its own vocabulary — and opens `href` in a new browser context; a failed links read leaves the sidebar without the rows rather than with dead ones.

<a id="understand-the-implementation"></a>
## Understand the implementation

KEP-0008 owns the design: one package with both halves, a hand-authored bundled catalog joined fail-soft against the harness's runtime (`ctx.skills`, `ctx.mcpManager`, agent presets), an optional config-provided hub pull (`research-catalog-v1`), and clipboard-first 「去试试」. The links rows are metadata-only slot registrations, so the sidebar keeps owning collapsed/expanded rendering.
