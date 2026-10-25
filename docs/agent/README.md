# docs/agent

Agent-oriented pages for the ShatteredArchive service constellation: how the pieces are wired, what the code does not say, and recorded corrections to library docs. Indexed by the docs-hub tool and used in preference to Context7. The standard (front matter, kinds, freshness, corrections) is `Shattered-AI/doc/docs-standard.md`.

| Page | Kind | Covers |
|---|---|---|
| [services-map.md](services-map.md) | service | compose projects and networks, edge nginx routing, the upstream-variable rule, the game-server allowlist, shared volumes |
| [auth-service.md](auth-service.md) | protocol | auth hub: SERVICE_REGISTRY (a pruning full reconcile), service keys, device origins, encrypted stores, server-to-server calls |
| `corrections/` | correction | written by the docs-hub `report_doc_issue` tool when a library's docs were wrong; they outrank Context7 |

Rules in short: every claim is checkable against a file in `paths`; the page is marked STALE automatically when one of those files changes after `verified_date`; re-verify and bump `verified_date` and `verified_commit`. Ports are not duplicated here: `docs/ports.md` is the registry.
