# ADR-057: API keys with scopes for headless CLI use

**Date:** 2026-05-22
**Status:** Accepted
**Owner:** @xjacka

## Context

The CLI authenticates against Keycloak via the OAuth Device Authorization Grant ([ADR-039](039-cli-foundation.md), [docs/architecture/cli.md](../architecture/cli.md#authentication)). For headless / CI use, `DAM_TOKEN` accepts a Keycloak access token verbatim and bypasses `auth.toml`. That bypass has three problems for programmatic agent runs (epic [#239](https://github.com/dam-agents/dam/issues/239)):

- Keycloak access tokens are short-lived; there is no in-CLI refresh path when `DAM_TOKEN` is set.
- They carry the user's full permissions; there is no way to grant narrower access (e.g. "only run this one agent").
- Revoking a token without invalidating the user's whole SSO session is not a first-class Keycloak workflow.

CI pipelines and orchestration layers need a long-lived, server-managed, scopable credential type. This ADR decides what that credential is and how it sits next to the existing Keycloak login path. Sub-issue [#249](https://github.com/dam-agents/dam/issues/249) frames the design space; this ADR resolves the open questions and pins the load-bearing rules.

## Decision

**Introduce API Keys as a new owner-scoped credential type, with three permission scopes, and let the existing `Authorization: Bearer` slot carry either credential type — discriminated by a `pk_` prefix.** Plaintext is returned once on create and never persisted; everything at rest is a SHA-256 digest. The CLI's `DAM_TOKEN` env var continues to accept either credential type — no CLI branching.

The load-bearing rules:

- **Three scopes, split by threat model.** An exfiltrated `agents:run` key must not be able to permanently change agent behavior. So anything that persists across runs is configuration; anything that just operates the agent in its current configuration is execution.
  - **`agents:manage`** — agent definitions and per-agent configuration. Anything that persists across runs: Agent CRUD, Schedules, Channels, Skills install/uninstall/publish, Egress-rule writes, granting Secrets / Connections to an agent, env / model / agent-level config, Template listing.
  - **`connections:manage`** — global credential lifecycle: Connections (OAuth-issued, e.g. GitHub, MCP) CRUD; Secrets (user-supplied API keys, GitHub PATs) CRUD. The *grant linkage* between a credential and a specific agent lives in `agents:manage`, not here. (Server modules `connections` and `secrets` are separate; the user-facing scope unifies them — fewer scopes at create time is the right trade.)
  - **`agents:run`** — operate an agent in its current configuration: ACP sessions, prompts, run output retrieval; Approvals (resolve pending HITL); pod-files read and write (including `dam import` — the CI prep path, and the agent itself can write the same paths during a run); Terminal sessions.
- **Owner-scoped.** Each key carries the creator's Keycloak `sub` on the row — the same `platform.ai/owner` axis [ADR-015](015-multi-user-auth.md) established for K8s resources.
- **Agent binding.** Each key has an allowlist of Agent IDs; default `*` covers every agent the owner owns now and in the future. Binding is per-Agent (not per-Instance) — [ADR-046](046-eliminate-instance.md) already collapsed those into one user-facing thing.
- **Optional expiry.** Keys can be long-lived in v1 — no mandatory rotation.
- **Plaintext returned once on create.** The CLI / UI surface the value once at creation time and never again; the server stores only a keyed (HMAC-SHA256) digest. There is no recovery path.
- **Shared Bearer slot, prefix-based dispatch.** Request-edge middleware reads `Authorization: Bearer <token>`. If `<token>` begins with `pk_`, the API-key validator runs (digest lookup → expiry check → load scopes and agent binding); otherwise the existing JWT validator runs. Both produce a unified `AuthContext { sub, scopes, agentIds | "*", keyId? }` downstream tRPC consumes.
- **Per-request scope re-evaluation.** Every authenticated request re-checks the owner's current effective permissions against the key's declared scopes. If the owner is demoted or disabled, all their keys lose those scopes immediately — no explicit revocation job, no cleanup. The key row itself remains; it just stops authorizing the protected procedures.
- **API keys cannot manage API keys.** The `api-keys.*` tRPC procedures reject any request where `AuthContext.keyId` is set. Creating, listing, and revoking keys requires an interactive Keycloak session. An exfiltrated key cannot mint others, cannot revoke others, and cannot extend its own life — the safety property worth paying for.
- **Token format and at-rest digest.** `pk_` + base64url-encoded 32 bytes of cryptographic randomness (Node stdlib; no hand-rolled encoder). At rest: HMAC-SHA256 keyed with a stable server-side pepper (`API_KEY_HMAC_KEY`, generated and persisted by the Helm chart, mirroring `ACTIVITY_HMAC_KEY`). A slow KDF (argon2id/bcrypt/scrypt) buys nothing for a 256-bit random secret and would tax every request; the keyed digest keeps validation cheap while adding defense-in-depth — a Postgres-only leak (without the app secret) yields digests an attacker cannot even verify a guessed token against.

CLI surface (this ADR commits only to the *shape*; flags belong in the implementation):

```
dam auth token create [--name] [--scope] [--agent] [--expires]   # prints plaintext once on stderr
dam auth token list                                              # never plaintext
dam auth token revoke <id>
```

## Alternatives Considered

- **Keycloak access token verbatim (status quo).** Short-lived, full user permissions, no narrowing, no revocation without invalidating the SSO session. Rejected: every headless ergonomics problem above traces back to this.
- **Keycloak service accounts (client credentials grant).** Long-lived, refreshable. Rejected: requires a per-user (or per-CI-bot) realm client to carry ownership; carries no agent-binding semantics; doubles the auth surface area for one capability.
- **Single combined `manage` scope.** Rejected: a `connections:manage` key shouldn't be able to rewrite an agent's egress rules — different blast radius, different threat model.
- **Separate `connections:manage` and `secrets:manage`.** Mirrors the server module split. Rejected: users see one concept ("credentials") regardless of whether the underlying store is K8s Secrets or OAuth Connections. Two scopes for one user-facing concept is cognitive overhead at create time with no enforcement gain.
- **Argon2id / bcrypt / scrypt at rest.** Standard for password hashing. Rejected: a slow KDF's value is brute-force resistance against weak inputs; a 32-byte urandom token has ~256 bits of entropy and is not brute-forceable. A KDF would only add per-request latency on the exact headless/CI hot path this ADR optimizes for, for no gain.
- **Plain (unkeyed) SHA-256 at rest.** Sufficient for brute-force resistance given the token's entropy, and was the original choice. Rejected on reconsideration: a keyed HMAC-SHA256 costs the same per request but adds defense-in-depth — a DB-only leak no longer lets an attacker verify a guessed or observed token offline. CodeQL's `js/insufficient-password-hash` also flags unkeyed fast hashes; the keyed construction is both more secure and clears the alert without suppression.
- **Mandatory expiry / rotation policy.** Considered. Rejected for v1: rotation policy is a separate decision worth its own ADR if/when it becomes load-bearing. Explicit `--expires` and `revoke` cover the immediate need.
- **A separate read-only scope.** Rejected: read is implicit in each scope (you cannot run an agent without reading its current configuration). Revisit if a use case appears that needs read-without-write.
- **`--token` flag on every command.** Rejected: leaks tokens into shell history and `ps`. The env-var-only path (`DAM_TOKEN=...`) already serves headless callers and is preserved verbatim.
- **A second `Authorization-Api-Key:` header.** Rejected: doubles client-side complexity. Prefix discrimination in one slot is what GitHub, Stripe, and most provider APIs do for the same reason.

## Consequences

- **Easier:** CI pipelines work without a browser — `export DAM_TOKEN=pk_…` is the entire ergonomic. Exfiltrated keys have a bounded blast radius: an `agents:run` key cannot rewrite egress rules, install skills, or rotate the user's GitHub PAT. Offboarding a user shrinks all their keys atomically via per-request scope re-evaluation; no key-revocation sweep job is needed when permissions change. The `pk_` prefix is immediately distinguishable from JWTs in logs, making credential-misuse detection straightforward.
- **Harder:** Every existing tRPC procedure now has to declare which scope it requires; the absence of a current procedure-builder pattern means the first PR introduces one. The bearer middleware grows a branch. Plaintext-only-once changes the UX shape on the create dialog — users who lose the value must rotate the key. The cross-module scope mapping (Schedules under `agents:manage`, Approvals under `agents:run`, etc.) must stay in sync with future feature additions; the ubiquitous-language entry below pins it.
- **Committed-to:** The `pk_` prefix is forever — changing it later requires a parallel-validator window. The three scope names (`agents:run`, `agents:manage`, `connections:manage`) enter the ubiquitous language and gate every networked verb. API keys cannot manage API keys — bypassing this rule destroys the only privilege-escalation barrier the design has. Plaintext-only-once means there is no recovery path; lost keys are revoked-and-recreated. The at-rest HMAC pepper (`API_KEY_HMAC_KEY`) must stay stable — rotating it invalidates every existing key, so it is generated once and persisted in a Secret like `ACTIVITY_HMAC_KEY`.

## Related ADRs

- [ADR-015](015-multi-user-auth.md) — Keycloak as the identity provider; `platform.ai/owner` label as the resource-scoping axis. API keys reuse the owner axis.
- [ADR-039](039-cli-foundation.md) — CLI foundation; this ADR fills the `DAM_TOKEN` slot with a server-managed credential type and resolves the auth question that ADR-039 explicitly deferred.
- [ADR-046](046-eliminate-instance.md) — Agent-as-only-runnable-resource is what makes agent-binding the right granularity (no Instance to bind to).
