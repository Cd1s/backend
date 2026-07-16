# AI maintainer guide

## Repository role

This is the backend fork for the Remnawave dual-core project.

- Fork: `Cd1s/backend`
- Maintained branch: `singbox`
- Upstream: `remnawave/backend` branch `main`
- Published artifact: `ghcr.io/cd1s/remnawave-backend`

The backend remains the authority for the API, database schema, config-profile model, Node
commands, user synchronization, traffic attribution, and subscription generation. The frontend
must consume its contracts, and the Node must remain compatible with the commands it sends.

The cross-repository source of truth is
[`Cd1s/remnawave-singbox`](https://github.com/Cd1s/remnawave-singbox). Read its project map,
feature registry, and upstream maintenance guide before changing behavior shared with the
frontend or Node.

## Fork-specific behavior

The `singbox` branch adds or preserves:

- `config_profiles.core_type`, defaulting to `xray`;
- a core-config abstraction that can process Xray and sing-box profiles;
- preservation of native sing-box JSON field names and inbound JSON;
- sing-box/AnyTLS user injection and Node command metadata;
- AnyTLS output for sing-box JSON and Shadowrocket-compatible subscriptions;
- Xray-compatible API paths, response fields, existing profiles, subscriptions, and migrations;
- tested upstream synchronization and multi-architecture fork images.

Important implementation areas include:

- `src/common/helpers/core-config/`
- `src/common/axios/node-contract-extensions.ts`
- `src/modules/config-profiles/`
- `src/modules/nodes/`
- `src/modules/subscription-template/`
- `src/modules/users/queries/get-prepared-config-with-users/`
- `prisma/migrations/`
- `scripts/validate-seed-core-inbounds.cjs`
- `scripts/validate-shadowrocket-anytls.cjs`

Do not assume this list is exhaustive. Compare the branch with `upstream/main` before modifying
fork behavior:

```bash
git diff --name-status upstream/main...HEAD
git log --oneline upstream/main..HEAD
```

## Compatibility invariants

These conditions must remain true after every upstream merge or custom feature:

1. Existing and newly migrated profiles use Xray unless `coreType` is explicitly `singbox`.
2. Existing Xray routes and wire fields continue to work.
3. A sing-box profile survives API storage and retrieval without camel-casing native JSON keys.
4. Updating or starting a sing-box profile does not discard its inbounds.
5. AnyTLS users use the established Remnawave identity mapping and remain attributable in traffic
   statistics.
6. Xray JSON subscriptions do not claim support for AnyTLS.
7. Shadowrocket and sing-box subscription output remains covered by regression validation.
8. Database migrations are additive and safe for an existing Xray installation. Never rewrite or
   delete an already published migration to resolve an upstream conflict.

## How to add a custom feature

Before implementation, add or update the feature in the central
`docs/custom-feature-registry.md`. Identify whether the feature also requires frontend or Node
changes.

Prefer:

- new modules, adapters, validators, and narrow contract extensions;
- explicit core-type branching at the boundary;
- backward-compatible optional fields;
- additive migrations with safe defaults;
- focused regression tests for every custom invariant.

Avoid:

- broad rewrites of upstream services;
- renaming upstream routes or fields only for the fork;
- silently converting Xray data to sing-box;
- using deployment-specific addresses, credentials, or certificates in source or tests;
- fixing a cross-repository contract in only one repository.

If upstream later implements equivalent behavior, adapt the fork to upstream's model and remove
the custom path only after migration, subscription, Xray compatibility, and Node integration tests
pass.

## Upstream synchronization failure

The scheduled workflow merges `upstream/main` in a temporary GitHub Actions checkout, validates the
result, and pushes only a tested merge. A conflict or failed test leaves `origin/singbox`
unchanged.

To repair a failure:

1. Fetch both remotes and create a temporary repair branch from `origin/singbox`.
2. Merge `upstream/main`; do not rebase or force-push the maintained branch.
3. Resolve conflicts by preserving upstream behavior and reapplying the compatibility invariants
   above.
4. Inspect all upstream changes around every conflicted service, contract, migration, and
   generator. A compile-only resolution is insufficient.
5. Run the validation gates below.
6. If shared contracts changed, validate the matching frontend and Node branches before merging.
7. Merge the repair into `singbox`; allow normal CI to publish artifacts.

Never bypass a failing custom validator merely to make automatic synchronization green.

## Validation gates

Use Node.js 24 and run:

```bash
npm ci --no-audit --no-fund
npm run build
npm run build:seed
npm run validate:seed-core-inbounds
npm run validate:shadowrocket-anytls
npm run check
```

For changes involving runtime commands, subscriptions, users, migrations, or core selection, also
run the isolated full-stack validation documented in the central repository.

## Definition of done

A backend change is complete only when:

- fork-specific and upstream behavior both pass;
- the feature registry reflects any changed ownership or invariant;
- related frontend and Node contracts are compatible;
- no secrets or infrastructure identifiers were committed;
- release notes identify the tested source commit and immutable image digest when an image is
  published.
