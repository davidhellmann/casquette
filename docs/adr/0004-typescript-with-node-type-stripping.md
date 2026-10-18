---
status: accepted
---

# TypeScript everywhere, scripts run by Node's type stripping

Casquette mixed three styles: TypeScript for the React islands and page payloads, plain JavaScript with occasional JSDoc for the domain modules (`src/training`, `src/ride`, `src/dashboard-period`, `src/lib`), and `.mjs` for the sync and site scripts. `tsconfig.json` had `checkJs: false`, so the domain core – where the rules live – was never type-checked, and the payload modules that import it saw only `any`. Nothing in the repo or CI ran a type check at all.

We decided:

- **Every module is TypeScript** (`.ts`, `.tsx`, `.astro`): `src/`, `scripts/`, tests, e2e helpers and configs. Only `website/` stays plain HTML/CSS/JS – it is a standalone page without a build (AGENTS.md) – and `website/ui/` is generated.
- **Scripts run directly on Node** (`node scripts/sync/strava-sync.ts`) through its built-in type stripping, which is on by default since Node 22.18. No build step, no `tsx`/`ts-node`. `engines` requires Node ≥ 22.18. `erasableSyntaxOnly` keeps the code to syntax Node can strip (no `enum`, `namespace`, parameter properties), relative imports name the real file (`./sync.ts`), and type-only imports use `import type` (`verbatimModuleSyntax`).
- **Strict from the start**: `astro/tsconfigs/strict`. `npm run typecheck` (`astro check`) checks `.ts`, `.tsx` and `.astro` in one pass; the deploy workflow runs it before the build.
- **TypeScript 6**, not 7: `@astrojs/check` supports TypeScript up to 6. Revisit when it supports 7.

The migration ran in two steps: every `.js`/`.mjs` was renamed to `.ts` with `// @ts-nocheck` and all references updated (behaviour unchanged), then each area removed its `@ts-nocheck` and got real types. `allowJs` goes once no JavaScript is left outside `website/`.

## Considered options

- **Keep JavaScript, enable `checkJs` with JSDoc types.** Rejected: JSDoc types are verbose for the shapes this code passes around (rides, payloads, zone sets), and two notations for one thing (JSDoc in the domain, TS in the islands) is what we wanted to end.
- **Run scripts with `tsx`.** Rejected: an extra runtime dependency for something Node does itself; the sync's "Node only" stance stays.
- **Compile scripts to JavaScript.** Rejected: a build step for local tools, and `npm run sync` would need it first.
- **Loose first, strict later.** Rejected: a loose baseline tends to stay; the domain core is small enough to type strictly in one pass.

## Consequences

- New code is TypeScript. A `.js`/`.mjs` file outside `website/` is a mistake (`src/repo-hygiene.test.ts` may guard it).
- Shared domain types (ride, athlete state, zones, dashboard period result, payloads) live next to the module that produces them and are exported from its entry point (`src/training/index.ts`, `src/ride/index.ts` …), not in a global types folder.
- Node-reachable modules (everything the scripts import from `src/`) must use explicit `.ts` import paths and no `@/` alias – Node resolves neither extensionless paths nor the alias.
